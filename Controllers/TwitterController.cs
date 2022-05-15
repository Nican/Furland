using FurlandGraph.Models;
using FurlandGraph.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Net;
using System.Net.Http.Headers;
using Tweetinvi;
using Tweetinvi.Auth;
using Tweetinvi.Parameters;

namespace FurlandGraph.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TwitterController : ControllerBase
    {
        private static readonly IAuthenticationRequestStore _myAuthRequestStore = new LocalAuthenticationRequestStore();

        public TwitterController(FurlandContext context, IOptions<TwitterConfiguration> twitterConfiguration, UserService userService)
        {
            Context = context;
            TwitterConfiguration = twitterConfiguration;
            UserService = userService;
        }

        public FurlandContext Context { get; }
        public IOptions<TwitterConfiguration> TwitterConfiguration { get; }
        public UserService UserService { get; }

        [HttpGet]
        [Route("{id}/picture")]
        public async Task<ActionResult> GetProfilePicture(long id)
        {
            var picture = await Context.ProfilePictures.FindAsync(id);

            if(picture == null)
            {
                return NotFound();
            }

            Response.Headers["cache-control"] = "public, max-age=604800";
            return File(picture.Data, "image/png");
        }

        [HttpGet]
        [Route("redirect")]
        public async Task<object> GetRedirectUrl()
        {
            var twitterConfig = TwitterConfiguration.Value;
            var appClient = new TwitterClient(twitterConfig.ConsumerKey, twitterConfig.ConsumerSecret);

            var authenticationRequestId = Guid.NewGuid().ToString();
            var redirectPath = "https://" + Request.Host.Value + "/validate/twitter";
            // var redirectPath = "https://graph.bunnypa.ws/validate/twitter";

            // Add the user identifier as a query parameters that will be received by `ValidateTwitterAuth`
            var redirectURL = _myAuthRequestStore.AppendAuthenticationRequestIdToCallbackUrl(redirectPath, authenticationRequestId);
            // Initialize the authentication process
            var authenticationRequestToken = await appClient.Auth.RequestAuthenticationUrlAsync(redirectURL);
            // Store the token information in the store
            await _myAuthRequestStore.AddAuthenticationTokenAsync(authenticationRequestId, authenticationRequestToken);

            // Redirect the user to Twitter
            return new
            {
                AuthorizationURL = authenticationRequestToken.AuthorizationURL
            };
        }

        [HttpPost]
        [Route("validate")]
        public async Task<object> Validate()
        {
            var twitterConfig = TwitterConfiguration.Value;
            var appClient = new TwitterClient(twitterConfig.ConsumerKey, twitterConfig.ConsumerSecret);

            var requestParameters = await RequestCredentialsParameters.FromCallbackUrlAsync(Request.QueryString.Value, _myAuthRequestStore);

            var userCreds = await appClient.Auth.RequestCredentialsAsync(requestParameters);
            var userClient = new TwitterClient(userCreds);
            var user = await userClient.Users.GetAuthenticatedUserAsync();

            var tokenRow = await Context.TwitterTokens.Where(t => t.Id == user.Id).FirstOrDefaultAsync();

            if (tokenRow == null)
            {
                Context.TwitterTokens.Add(new TwitterToken()
                {
                    Id = user.Id,
                    AccessSecret = userCreds.AccessTokenSecret,
                    AccessToken = userCreds.AccessToken,
                    BearerToken = userCreds.BearerToken,
                    NextFriendsRequest = DateTime.UtcNow,
                });
            }
            else
            {
                tokenRow.AccessSecret = userCreds.AccessTokenSecret;
                tokenRow.AccessToken = userCreds.AccessToken;
                tokenRow.BearerToken = userCreds.BearerToken;
            }

            await UserService.CollectUser(Context, user);
            await Context.SaveChangesAsync();

            // HttpContext.Session.SetString("userId", user.IdStr);

            return new
            {
                Id = user.Id.ToString(),
                ScreenName = user.ScreenName,
                Name = user.Name,
            };
        }
    }
}
