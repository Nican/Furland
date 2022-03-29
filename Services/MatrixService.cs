using Dapper;
using FurlandGraph.Models;
using MessagePack;
using Microsoft.EntityFrameworkCore;

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
        public MatrixService(FurlandContext context)
        {
            Context = context;
        }

        public FurlandContext Context { get; }

        public async Task RunAsync()
        {
            Console.WriteLine("Starting matrix service...");
            try
            {
                while (true)
                {
                    var item = await this.Context.GraphCache
                        .Where(t => t.Data == null)
                        .OrderByDescending(t => t.CreatedAt)
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
                Console.WriteLine(e);
            }
        }

        public async Task CalculateItem(GraphCache item, CancellationToken cancellationToken)
        {
            var lz4Options = MessagePackSerializerOptions.Standard.WithCompression(MessagePackCompression.Lz4BlockArray);
            var userId = item.UserId;
            var userFriends = await Context.UserFriends
                .Where(t => t.UserId == userId && t.Friend.Protected == false && t.Friend.Deleted == false)
                .Select(t => t.FriendId)
                .ToListAsync(cancellationToken: cancellationToken);
            userFriends.Add(userId);
            userFriends.Sort();

            var friends = await Context.Users.Where(t => userFriends.Contains(t.Id)).ToDictionaryAsync(t => t.Id);

            var muturalMatrix = await GetMutualMatrix(userFriends, cancellationToken);

            var cacheItem = new GraphCacheItem()
            {
                Friends = userFriends.Select(id =>
                {
                    // Use a dictornary here since we must preserve order
                    var friend = friends[id];

                    return new GraphCacheFriendItem()
                    {
                        Id = friend.Id.ToString(),
                        ScreenName = friend.ScreenName,
                        ProfileImageUrl = friend.ProfileImageUrl,
                        FollowersCount = friend.FollowersCount,
                        FriendsCount = friend.FriendsCount,
                        StatusesCount = friend.StatusesCount,
                    };
                }).ToList(),
                MutualMatrix = muturalMatrix.ToList(),
            };

            item.Data = MessagePackSerializer.Serialize(cacheItem, lz4Options, cancellationToken);
            item.FinishedAt = DateTime.UtcNow;
            await Context.SaveChangesAsync();

        }

        private async Task<List<long>> GetMutualMatrix(List<long> userFriends, CancellationToken cancellationToken)
        {
            string sql = $@"with friends as (
	select ""id"" from ""users"" u where u.id IN ({string.Join(",", userFriends)})
),
crossFriends as (
	select f1.id as id1, f2.id as id2 from friends f1 cross join friends f2
),
mutuals as (
	select cf.id1, cf.id2, count(*) from crossFriends as cf
	join ""userFriends"" uf1 on uf1.""userId"" = cf.id1 
	join ""userFriends"" uf2 on uf2.""userId"" = uf1.""friendId"" and uf2.""friendId"" = cf.id2 
	group by cf.id1, cf.id2
)
select * from mutuals order by id1 asc,id2 asc;";

            var queryDef = new CommandDefinition(sql, flags: CommandFlags.Buffered, commandTimeout: 300, cancellationToken: cancellationToken);
            var reader = await Context.Database.GetDbConnection().QueryAsync<GraphRow>(queryDef);

            // Use ToList to process the list early, since the reader will not last forever
            return GetMutualMatrix(userFriends, reader).ToList();
        }

        private IEnumerable<long> GetMutualMatrix(List<long> userFriends, IEnumerable<GraphRow> result)
        {
            var reader = result.GetEnumerator();
            GraphRow row = null;

            if (reader.MoveNext())
            {
                row = reader.Current;
            }

            foreach (var f1 in userFriends)
            {
                foreach (var f2 in userFriends)
                {
                    if (row != null && f1 == row.Id1 && f2 == row.Id2)
                    {
                        yield return row.Count;
                        if (reader.MoveNext())
                        {
                            row = reader.Current;
                        }
                        else
                        {
                            row = null;
                        }
                    }
                    else
                    {
                        yield return 0;
                    }
                }
            }
        }
    }
}
