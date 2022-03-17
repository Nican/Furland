using FurlandGraph.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Dapper;
using System.Runtime.CompilerServices;
using MessagePack;

namespace FurlandGraph.Controllers
{
    public class GraphRow
    {
        public long Id1 { get; set; }

        public long Id2 { get; set; }

        public long Count { get; set; }
    }

    public class LoadStatus
    {
        public long Id { get; set; }
        public string ScreenName { get; set; }
        public long TotalWorkItems { get; set; }
        public long NeedCollectedCount { get; set; }
        public bool Finished { get; set; }

        public long Stage { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class GraphController : ControllerBase
    {
        public GraphController(FurlandContext context)
        {
            Context = context;
        }

        public FurlandContext Context { get; }

        public long UserId = 2165919391; // Nican = 2165919391 / Zenith = 1121276212205248512

        [HttpGet]
        [Route("followers")]
        public async IAsyncEnumerable<object> GetFollowers()
        {
            var userFriends = await Context.UserFriends.Where(t => t.UserId == UserId).Select(t => t.FriendId).ToListAsync(); // && t.Friend.Protected == false
            userFriends.Add(UserId);
            userFriends.Sort();

            foreach (var friend in userFriends)
            {
                var user = await Context.Users.Where(t => t.Id == friend).FirstOrDefaultAsync();

                if (user == null)
                {
                    yield return null;
                    continue;
                }

                yield return new
                {
                    Id = user.Id,
                    user.ScreenName,
                    user.ProfileImageUrl,
                };
            }
        }

        [HttpGet]
        [Route("user/{userId}/status")]
        public async Task<LoadStatus> GetUserStatus(string userId)
        {
            var past = DateTime.UtcNow - TimeSpan.FromDays(30);
            var user = await Context.Users.Where(t => t.ScreenName == userId).FirstOrDefaultAsync();

            if (user == null)
            {
                throw new Exception(); // TODO
            }

            if (user.FriendsCollected == null || user.FriendsCollected < past)
            {
                if(!await Context.WorkItems.Where(t=> t.UserId == user.Id).AnyAsync())
                {
                    var workitem = new WorkItem()
                    {
                        ForUser = user.Id,
                        UserId = user.Id,
                        Type = "friends",
                    };
                    Context.WorkItems.Add(workitem);
                }

                return new LoadStatus()
                {
                    Id = user.Id,
                    ScreenName = user.ScreenName,
                    TotalWorkItems = await Context.WorkItems.CountAsync(),
                    NeedCollectedCount = 1,
                    Finished = false,
                    Stage = 1,
                };
            }

            var followers = await Context.UserFriends
                .Where(t => t.UserId == user.Id && t.Friend.Protected == false && t.Friend.Deleted == false)
                .Select(t => new { t.Friend.FriendsCollected, t.Friend.Protected, t.FriendId })
                .ToListAsync();

            var needCollected = followers.Where(t => (t.FriendsCollected == null || t.FriendsCollected < past) && t.Protected == false).ToList();

            if (needCollected.Count > 0)
            {
                var needsCollectedIds = needCollected.Select(t => t.FriendId).ToList();
                // Do not add work items that already exist as an work item
                var doNotAdd = await Context.WorkItems
                    .Where(t => needsCollectedIds.Contains(t.UserId) && t.Type == "friends")
                    .Select(t => t.UserId)
                    .ToListAsync();

                Context.WorkItems.AddRange(needCollected.Where(t => !doNotAdd.Contains(t.FriendId)).Select(t =>
                {
                    return new WorkItem()
                    {
                        ForUser = user.Id,
                        UserId = t.FriendId,
                        Type = "friends",
                    };
                }));
                await Context.SaveChangesAsync();
            }

            var totalWorkItems = await Context.WorkItems.CountAsync();

            return new LoadStatus()
            {
                Id = user.Id,
                ScreenName = user.ScreenName,
                TotalWorkItems = totalWorkItems,
                NeedCollectedCount = needCollected.Count,
                Finished = needCollected.Count == 0,
                Stage = 2,
            };
        }

        [HttpGet]
        [Route("friendmatrix")]
        public async IAsyncEnumerable<long> GetFriendMatrix()
        {
            var userFriends = await Context.UserFriends
                .Where(t => t.UserId == UserId)
                .Select(t => t.FriendId)
                .ToListAsync();
            userFriends.Add(UserId);
            userFriends.Sort();

            string sql = $@"with a as (
	select * from users u where u.id={UserId}
),
friends as (
	select ""friendId"" as ""id"" from ""userFriends"" uf join users u on u.id=uf.""userId"" where uf.""userId"" = (select a.id from a) and u.protected =false

    union
    select a.id as ""id"" from a
)
select uf1.""userId"" as id1, uf1.""friendId"" as id2, 1 as count from friends
join ""userFriends"" uf1 on uf1.""userId"" = friends.id and uf1.""friendId"" in (select id from friends)
order by id1 asc, id2 asc";

            var queryDef = new CommandDefinition(sql, flags: CommandFlags.Buffered);
            using var reader = await Context.Database.GetDbConnection().ExecuteReaderAsync(queryDef);
            var rowParser = reader.GetRowParser<GraphRow>();
            GraphRow row = null;

            if (await reader.ReadAsync())
            {
                row = rowParser(reader);
            }

            foreach (var f1 in userFriends)
            {
                foreach (var f2 in userFriends)
                {
                    if (row != null && f1 == row.Id1 && f2 == row.Id2)
                    {
                        yield return row.Count;
                        if (await reader.ReadAsync())
                        {
                            row = rowParser(reader);
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

        [HttpGet]
        [Route("user/{screenName}/matrix")]
        public async Task<IActionResult> Get(string screenName, CancellationToken cancellationToken)
        {
            var user = await Context.Users.FirstOrDefaultAsync(t => t.ScreenName == screenName);

            if (user == null)
            {
                throw new Exception();
            }

            var userId = user.Id;
            var lz4Options = MessagePackSerializerOptions.Standard.WithCompression(MessagePackCompression.Lz4BlockArray);
            var cache = await Context.GraphCache.Where(t => t.UserId == userId && t.Type == "friends").FirstOrDefaultAsync();

            if (cache != null)
            {
                var cacheData = MessagePackSerializer.Deserialize<GraphCacheItem>(cache.Data, lz4Options);
                return new FileContentResult(MessagePackSerializer.Serialize(cacheData), "application/json")
                {
                    FileDownloadName = $"userdata.msgpack"
                };
            }

            var userFriends = await Context.UserFriends
                .Where(t => t.UserId == userId && t.Friend.Protected == false && t.Friend.Deleted == false)
                .Select(t => t.FriendId)
                .ToListAsync();
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
                        Id = friend.Id,
                        ScreenName = friend.ScreenName,
                        ProfileImageUrl = friend.ProfileImageUrl,
                    };
                }).ToList(),
                MutualMatrix = muturalMatrix.ToList(),
            };

            var content = MessagePackSerializer.Serialize(cacheItem, lz4Options);

            cache = new GraphCache()
            {
                UserId = userId,
                Type = "friends",
                Data = content,
            };
            Context.GraphCache.Add(cache);
            await Context.SaveChangesAsync();

            return new FileContentResult(MessagePackSerializer.Serialize(cacheItem), "application/msgpack")
            {
                FileDownloadName = $"userdata.msgpack"
            };
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
