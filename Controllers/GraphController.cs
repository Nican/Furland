using FurlandGraph.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MessagePack;

namespace FurlandGraph.Controllers
{
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
                if (!await Context.WorkItems.Where(t => t.UserId == user.Id && t.Type == "friends").AnyAsync())
                {
                    var workitem = new WorkItem()
                    {
                        ForUser = user.Id,
                        UserId = user.Id,
                        Type = "friends",
                    };
                    Context.WorkItems.Add(workitem);
                    await Context.SaveChangesAsync();
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
                .Select(t => new { t.Friend.FriendsCollected, t.FriendId, t.Friend.ScreenName, t.Friend.LastUpdate })
                .ToListAsync();

            var needUserCollect = followers
                 .Where(t => t.LastUpdate < past)
                 .ToList();


            // Stage 2 - Collect user profiles
            if (needUserCollect.Count > 0)
            {
                var needsCollectedIds = needUserCollect.Select(t => t.FriendId).ToList();
                // Do not add work items that already exist as an work item
                var doNotAdd = await Context.WorkItems
                    .Where(t => needsCollectedIds.Contains(t.UserId) && t.Type == "user")
                    .Select(t => t.UserId)
                    .ToListAsync();

                Context.WorkItems.AddRange(needUserCollect.Select(t=> t.FriendId).Except(doNotAdd).Select(t =>
                {
                    return new WorkItem()
                    {
                        ForUser = user.Id,
                        UserId = t,
                        Type = "user",
                    };
                }));
                await Context.SaveChangesAsync();

                var totalWorkItems = await Context.WorkItems.CountAsync();
                return new LoadStatus()
                {
                    Id = user.Id,
                    ScreenName = user.ScreenName,
                    TotalWorkItems = totalWorkItems,
                    NeedCollectedCount = needsCollectedIds.Count,
                    Finished = false,
                    Stage = 2,
                };
            }

            // Stage 3 - Collect user followers
            var needCollected = followers
                .Where(t => t.FriendsCollected == null || t.FriendsCollected < past)
                .Where(t => !string.IsNullOrEmpty(t.ScreenName))
                .ToList();

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

                var totalWorkItems = await Context.WorkItems.CountAsync();
                return new LoadStatus()
                {
                    Id = user.Id,
                    ScreenName = user.ScreenName,
                    TotalWorkItems = totalWorkItems,
                    NeedCollectedCount = needCollected.Count,
                    Finished = needCollected.Count == 0,
                    Stage = 3,
                };
            }

            // Stage 4 - calculate friendship graph
            var cacheItem = await Context.GraphCache
                .Where(t => t.UserId == user.Id && t.Type == "friends")
                .Select(t => new { t.UserId, t.FinishedAt })
                .FirstOrDefaultAsync();

            if (cacheItem == null)
            {

                var newCacheItem = new GraphCache()
                {
                    Type = "friends",
                    UserId = user.Id,
                };

                Context.GraphCache.Add(newCacheItem);
                await Context.SaveChangesAsync();
                cacheItem = new { UserId = user.Id, FinishedAt = (DateTime?)null };
            }

            return new LoadStatus()
            {
                Id = user.Id,
                ScreenName = user.ScreenName,
                TotalWorkItems = await Context.GraphCache.Where(t => t.FinishedAt == null).CountAsync(),
                NeedCollectedCount = 0,
                Finished = cacheItem.FinishedAt.HasValue,
                Stage = 4,
            };
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

            if (cache == null)
            {
                throw new Exception();
            }

            var cacheData = MessagePackSerializer.Deserialize<GraphCacheItem>(cache.Data, lz4Options);
            return new FileContentResult(MessagePackSerializer.Serialize(cacheData), "application/json")
            {
                FileDownloadName = $"userdata.msgpack"
            };
        }
    }
}
