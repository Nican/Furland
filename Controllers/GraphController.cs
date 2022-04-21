using FurlandGraph.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MessagePack;
using FurlandGraph.Services;

namespace FurlandGraph.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GraphController : ControllerBase
    {
        public GraphController(FurlandContext context, StatusService statusService)
        {
            Context = context;
            StatusService = statusService;
        }

        public FurlandContext Context { get; }
        public StatusService StatusService { get; }

        [HttpGet]
        [Route("user/{username}/status")]
        public async Task<LoadStatus> GetUserStatus(string username, long userId, string nodes = "friends", string relationship = "friends")
        {
            //long? userId = null;
            //var userIdStr = HttpContext.Session.GetString("userId");

            //if (long.TryParse(userIdStr, out var userIdParsed))
            //{
            //    userId = userIdParsed;
            //}

            long? requesterId = userId == 0 ? null : userId;

            if (nodes != "friends" && nodes != "followers")
            {
                throw new Exception();
            }

            if (relationship != "friends" && relationship != "followers")
            {
                throw new Exception();
            }

            try
            {
                return await StatusService.CheckStatus(username, nodes, relationship, requesterId);
            }
            catch (StatusServiceException e)
            {
                return new LoadStatus()
                {
                    Finished = false,
                    Error = e.Message,
                };
            }
        }

        [HttpGet]
        [Route("user/{screenName}/matrix")]
        public async Task<IActionResult> Get(string screenName, string nodes = "friends", string relationship = "friends")
        {
            var user = await Context.Users.FirstOrDefaultAsync(t => t.ScreenName == screenName);
            if (user == null)
            {
                throw new Exception("Could not find: " + screenName);
            }

            var workItemName = $"{nodes}+{relationship}";
            var userId = user.Id;
            var lz4Options = MessagePackSerializerOptions.Standard.WithCompression(MessagePackCompression.Lz4BlockArray);
            var cache = await Context.GraphCache.Where(t => t.UserId == userId && t.Type == workItemName).FirstOrDefaultAsync();

            if (cache == null)
            {
                throw new Exception();
            }

            var cacheData = MessagePackSerializer.Deserialize<GraphCacheItem>(cache.Data, lz4Options);
            Response.Headers["cache-control"] = "public, max-age=604800";
            return new FileContentResult(MessagePackSerializer.Serialize(cacheData), "application/json")
            {
                FileDownloadName = $"userdata.msgpack",
            };
        }
    }
}
