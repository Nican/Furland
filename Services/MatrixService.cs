using Dapper;
using FurlandGraph.Models;
using MessagePack;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace FurlandGraph.Services
{
    public class GraphRow
    {
        public long Id1 { get; set; }

        public long Id2 { get; set; }

        public long Count { get; set; }
    }

    public class MatrixService
    {
        public static readonly long MaxAccountSize = 150000;

        public MatrixService(FurlandContext context, IDbContextFactory<FurlandContext> contextFactory, IOptions<HarvesterConfig> harvestConfiguration)
        {
            Context = context;
            ContextFactory = contextFactory;
            HarvestConfiguration = harvestConfiguration;
        }

        public FurlandContext Context { get; }
        public IDbContextFactory<FurlandContext> ContextFactory { get; }
        public IOptions<HarvesterConfig> HarvestConfiguration { get; }

        public async Task RunAsync()
        {
            if (!HarvestConfiguration.Value.Matrix)
            {
                Console.WriteLine("!! Matrix service is disabled !!");
                return;
            }

            Console.WriteLine("Starting matrix service...");

            while (true)
            {
                try
                {
                    while (true)
                    {
                        var item = await this.Context.GraphCache
                            .Where(t => t.Data == null)
                            .OrderBy(t => t.CreatedAt)
                            .FirstOrDefaultAsync();

                        if (item == null)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(3));
                            continue;
                        }

                        await CalculateItem(item, CancellationToken.None);
                        Context.ChangeTracker.Clear();
                    }
                }
                catch (Exception e)
                {
                    Console.WriteLine("Marvest worker thread died: " + e);
                }
                await Task.Delay(TimeSpan.FromSeconds(5));
            }
        }

        public async Task CalculateItem(GraphCache item, CancellationToken cancellationToken)
        {
            var lz4Options = MessagePackSerializerOptions.Standard.WithCompression(MessagePackCompression.Lz4BlockArray);
            var userId = item.UserId;
            string[] types = item.Type.Split('+');
            string nodes = types[0];
            string relationship = types[1];

            var userFriends = await Context.UserRelations
                .Where(t => t.UserId == userId && t.Type == nodes)
                .Select(t => t.List)
                .AsNoTracking()
                .FirstAsync(cancellationToken: cancellationToken);

            userFriends.Add(userId);

            // Remove all users whom's account is not private
            var users = await Context.Users
                .Where(t => userFriends.Contains(t.Id) && t.Protected == false && t.Deleted == false && t.ScreenName != null)
                .OrderBy(t => t.Id)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            if (relationship == "friends")
            {
                users = users.Where(t => t.FriendsCount > 1).ToList();
            }
            else
            {
                users = users.Where(t => t.FollowersCount > 1).ToList();
            }

            userFriends = users.Select(t => t.Id).ToList();

            /*
            var relationMap = await Context.UserRelations
                .Where(t => t.Type == relationship && userFriends.Contains(t.UserId))
                .AsNoTracking()
                .ToDictionaryAsync(t => t.UserId, cancellationToken);
            */
            var relationMap = await GetParallelRelations(userFriends, relationship);

            // We need to keep the order of userFriends
            var relations = userFriends.Select(t => relationMap.ContainsKey(t) ? relationMap[t].List.ToArray() : Array.Empty<long>()).ToList();

            Stopwatch watch = new Stopwatch();
            watch.Start();
            var muturalMatrix = GetMutualMatrix(relations);
            Console.WriteLine($"Time to complete: {watch.Elapsed.TotalSeconds} seconds.");

            var cacheItem = new GraphCacheItem()
            {
                Friends = users.Select(friend =>
                {
                    var mutuals = new List<string>();

                    if (relationMap.ContainsKey(friend.Id))
                    {
                        mutuals = Relation.Merge(relationMap[friend.Id].List, userFriends)
                            .Select(t => t.ToString())
                            .ToList();
                    }

                    return new GraphCacheFriendItem()
                    {
                        Id = friend.Id.ToString(),
                        ScreenName = friend.ScreenName,
                        FollowersCount = friend.FollowersCount,
                        FriendsCount = friend.FriendsCount,
                        StatusesCount = friend.StatusesCount,
                        LastStatus = friend.LastStatus,
                        Friends = mutuals,
                    };
                }).ToList(),
                MutualMatrix = muturalMatrix,
            };

            item.Data = MessagePackSerializer.Serialize(cacheItem, lz4Options, cancellationToken);
            item.FinishedAt = DateTime.UtcNow;
            await Context.SaveChangesAsync();

        }

        private async Task<Dictionary<long, UserRelations>> GetParallelRelations(List<long> userFriends, string relationship)
        {
            var size = Math.Max(userFriends.Count / 20, 100);
            var userRelations = new Dictionary<long, UserRelations>();

            var chunks = userFriends.Chunk(size).Select(async chunk =>
            {
                using var dbContext = await ContextFactory.CreateDbContextAsync();
                return await dbContext.UserRelations
                    .Where(t => t.Type == relationship && chunk.Contains(t.UserId))
                    .AsNoTracking()
                    .ToListAsync();
            }).ToList();

            await Task.WhenAll(chunks);

            foreach (var chunk in chunks)
            {
                foreach (var result in await chunk)
                {
                    userRelations.Add(result.UserId, result);
                }
            }

            return userRelations;
        }

        private unsafe List<int> GetMutualMatrix(List<long[]> relations)
        {
            int count = relations.Count;
            List<int> results = new(count * count + 1);

            var entries = new ConcurrentDictionary<int, int[]>();
            var indexes = Enumerable.Range(0, count).ToList();

            var options = new ParallelOptions()
            {
                MaxDegreeOfParallelism = Environment.ProcessorCount - 1,
            };

            Parallel.ForEach(indexes, options, index =>
            {
                var slice = new int[count];
                var f1 = relations[index];

                for (int j = index; j < count; j++)
                {
                    var f2 = relations[j];
                    // This may be called 4,000,000 times for an user with 2,000 friends
                    slice[j] = Relation.MergeCount(f1, f2);
                }

                entries[index] = slice;
            });

            for (int i = 0; i < count; i++)
            {
                var slice = entries[i];

                // Since the matrix is symetrical over the diagonal axis
                // We can just copy over the values we already computed
                for (int j = 0; j < i; j++)
                {
                    var value = results[j * count + i];
                    slice[j] = value;
                }

                results.AddRange(slice);
            }

            /*
            int i = 0;
            foreach (var f1 in relations)
            {
                // Since the matrix is symetrical over the diagonal axis
                // We can just copy over the values we already computed
                for (int j = 0; j < i; j++)
                {
                    var value = results[j * count + i];
                    results.Add(value);
                }

                for (int j = i; j < count; j++)
                {
                    var f2 = relations[j];
                    // This may be called 4,000,000 times for an user with 2,000 friends
                    results.Add(Relation.MergeCount(f1, f2));
                }

                i++;
            }
            */

            return results;
        }
    }

    public class Relation
    {
        private readonly List<long> list;

        public int position = 0;

        public long Value
        {
            get { return list[position]; }
        }

        public Relation(List<long> list)
        {
            this.list = list;
        }

        public void Advance()
        {
            position++;
        }

        public bool IsPastEnd()
        {
            return position >= list.Count - 1;
        }

        /// <summary>
        /// Pointer implementation 
        /// 28 seconds for pointer path
        /// 34 seconds for safe implementation 
        /// </summary>
        /// <param name="leftArray"></param>
        /// <param name="rightArray"></param>
        /// <returns></returns>
        public static unsafe int MergeCount(long[] leftArray, long[] rightArray)
        {
            int count = 0;

            if (leftArray.Length == 0 || rightArray.Length == 0)
            {
                return 0;
            }

            fixed (long* leftPtrStart = leftArray, rightPtrStart = rightArray)
            {
                long* leftPtr = leftPtrStart;
                long* rightPtr = rightPtrStart;
                long* leftEnd = leftPtr + leftArray.Length;
                long* rightEnd = rightPtr + rightArray.Length;

                if (leftPtr == rightPtr)
                {
                    return leftArray.Length;
                }

                while (true)
                {
                    while (*leftPtr < *rightPtr)
                    {
                        leftPtr++;
                        if (leftPtr >= leftEnd)
                            return count;
                    }
                    while (*leftPtr > *rightPtr)
                    {
                        rightPtr++;
                        if (rightPtr >= rightEnd)
                            return count;
                    }
                    while (*leftPtr == *rightPtr)
                    {
                        count++;
                        leftPtr++;
                        rightPtr++;
                        if (leftPtr >= leftEnd || rightPtr >= rightEnd)
                            return count;
                    }
                }
            }
        }

        public static int MergeCountOld(long[] leftArray, long[] rightArray)
        {
            int leftCount = leftArray.Length;
            int rightCount = rightArray.Length;

            if (leftCount == 0 || rightCount == 0)
            {
                return 0;
            }

            long leftValue = leftArray[0];
            long rightValue = rightArray[0];
            int leftPosition = 0;
            int rightPosition = 0;
            int count = 0;

            // while (leftPosition < leftCount && rightPosition < rightCount)
            // TODO: Could this be faster with pointers?
            while (true)
            {
                if (leftValue == rightValue)
                {
                    count++;
                    leftPosition++;
                    rightPosition++;

                    if (leftPosition >= leftCount || rightPosition >= rightCount)
                        break;

                    leftValue = leftArray[leftPosition];
                    rightValue = rightArray[rightPosition];
                }
                else if (leftValue < rightValue)
                {
                    leftPosition++;
                    if (leftPosition >= leftCount)
                        break;

                    leftValue = leftArray[leftPosition];
                }
                else
                {
                    rightPosition++;
                    if (rightPosition >= rightCount)
                        break;

                    rightValue = rightArray[rightPosition];
                }
            }

            return count;
        }

        public static List<long> Merge(List<long> leftList, List<long> rightList)
        {
            Relation left = new Relation(leftList);
            Relation right = new Relation(rightList);
            List<long> output = new();
            while (!left.IsPastEnd() && !right.IsPastEnd())
            {
                if (left.Value == right.Value)
                {
                    output.Add(left.Value);
                    left.Advance();
                    right.Advance();
                }
                else if (left.Value < right.Value)
                {
                    left.Advance();
                }
                else
                {
                    right.Advance();
                }
            }
            return output;
        }
    }
}
