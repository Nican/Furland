using FurlandGraph.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tweetinvi;
using Tweetinvi.Exceptions;
using Tweetinvi.Iterators;
using Tweetinvi.Models;
using Tweetinvi.Parameters;

namespace FurlandGraph.Services
{
    public class BasicHarvestUser
    {
        public string ScreenName { get; set; }

        public bool Deleted { get; set; }

        public bool Protected { get; set; }

        public DateTime? FollowersCollected { get; set; }

        public DateTime? FriendsCollected { get; set; }
    }

    public class WorkItemWithUser
    {
        public long Id { get; set; }

        public BasicHarvestUser User { get; set; }
    }

    public class HarvestService
    {
        public HarvestService(
            FurlandContext context,
            IDbContextFactory<FurlandContext> contextFactory,
            IOptions<TwitterConfiguration> twitterConfiguration,
            IOptions<HarvesterConfig> harvestConfiguration,
            UserService userService)
        {
            Context = context;
            ContextFactory = contextFactory;
            TwitterConfiguration = twitterConfiguration;
            HarvestConfiguration = harvestConfiguration;
            UserService = userService;
        }

        public FurlandContext Context { get; }
        public IDbContextFactory<FurlandContext> ContextFactory { get; }
        public IOptions<TwitterConfiguration> TwitterConfiguration { get; }
        public IOptions<HarvesterConfig> HarvestConfiguration { get; }
        public UserService UserService { get; }


        public Queue<long> WorkItems = new Queue<long>();

        public Queue<TwitterToken> AvailableTokens = new Queue<TwitterToken>();

        public async Task ParallelRun()
        {
            if (!HarvestConfiguration.Value.Enabled)
            {
                Console.WriteLine($"!! Harvest service not enabled !!");
                return;
            }

            while (true)
            {
                try
                {
                    long count = 0;
                    // int maxWorkers = 100;
                    var trackers = new Dictionary<Task<bool>, TwitterClientTracker>();

                    Console.WriteLine($"Max workers: {HarvestConfiguration.Value.MaxWorkers}");

                    while (true)
                    {
                        TwitterClientTracker tracker = null;
                        var completedTask = trackers.Keys.Where(t => t.IsCompleted).OrderBy(t => t.Id).FirstOrDefault(); // Check if any of the workers is finished

                        if (completedTask == null)
                        {
                            if (trackers.Count >= HarvestConfiguration.Value.MaxWorkers) // If no workers are finished, see if we can create a new one
                            {
                                await Task.Delay(TimeSpan.FromSeconds(0.1));
                                continue;
                            }
                        }
                        else
                        {
                            trackers.Remove(completedTask, out tracker); // Remove the worker from the list
                            try
                            {
                                bool result = await completedTask; // If the pagination is finished, remove the work item
                                if (result)
                                {
                                    // var workItemToRemove = await Context.WorkItems.FindAsync(tracker.WorkItemId);
                                    // Context.WorkItems.Remove(workItemToRemove);
                                    // await Context.SaveChangesAsync();
                                }
                            }
                            catch (TwitterException ex) when (ex.Message.Contains("Rate limit exceeded (88)"))
                            {
                                var a = tracker.TwitterClient.RateLimits.GetEndpointRateLimitAsync(ex.URL);
                                var waitTime = TimeSpan.FromMinutes(15);

                                if (ex.TwitterQuery != null && ex.TwitterQuery.QueryRateLimit != null)
                                {
                                    waitTime = TimeSpan.FromSeconds(ex.TwitterQuery.QueryRateLimit.ResetDateTimeInSeconds + 5);
                                }
                                else
                                {
                                    Console.WriteLine("What error is this?" + ex.ToString());
                                    Console.WriteLine("What error is this? PArt 2" + ex.Message);
                                    Console.WriteLine("What error is this? PArt 3" + ex.TwitterDescription.ToString());
                                }

                                // API Key has no calls left
                                tracker.Token.NextFriendsRequest = DateTime.UtcNow + waitTime;
                                await Context.SaveChangesAsync();
                                tracker = null;
                            }
                            catch (TwitterException ex) when (ex.Message.Contains("Invalid or expired token"))
                            {
                                Context.TwitterTokens.Remove(tracker.Token);
                                await Context.SaveChangesAsync();
                                tracker = null;
                            }
                            catch (TwitterException ex) when (ex.ToString().Contains("To protect our users from spam and other malicious activity, this account is temporarily locked."))
                            {
                                // Oooops
                                Console.WriteLine("To protect our users from spam and other malicious activity, this account is temporarily locked.");

                                tracker.Token.NextFriendsRequest = DateTime.UtcNow + TimeSpan.FromDays(1000);
                                await Context.SaveChangesAsync();

                                tracker = null;
                            }
                            catch (TwitterTimeoutException ex)
                            {
                                // .NET is limiting the number of concurrent conncetions....
                                // Just wait a while
                                await Task.Delay(TimeSpan.FromSeconds(5));
                                Console.WriteLine("Twitter timeout...");
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine("Unkown error type: " + ex.GetType().FullName);
                                Console.WriteLine("Error full: " + ex.ToString());
                                Console.WriteLine("Error inner: " + ex.InnerException?.ToString());
                            }
                        }

                        if (tracker != null && !tracker.CanWork()) // API key has no calls left
                        {
                            var nextRequest = TimeSpan.FromMinutes(15);

                            //var rateLimit = await tracker.TwitterClient.RateLimits.GetEndpointRateLimitAsync("https://api.twitter.com/1.1/followers/ids.json");
                            //if (rateLimit != null)
                            //{
                            //    nextRequest = TimeSpan.FromSeconds(rateLimit.ResetDateTimeInSeconds + 5);
                            //}

                            tracker.Token.NextFriendsRequest = DateTime.UtcNow + nextRequest;
                            await Context.SaveChangesAsync();
                            tracker = null;
                        }

                        if (tracker == null) // Finda new API key
                        {
                            var token = await GetNextToken(trackers.Values.Select(t => t.Token.Id).ToList());
                            if (token == null)
                            {
                                await Task.Delay(TimeSpan.FromSeconds(1)); // No API Keys found
                                continue;
                            }

                            var client = GetClientFromToken(token);
                            tracker = new TwitterClientTracker(token, client);
                        }

                        var workItemId = await GetNextWorkItem(trackers.Values.Select(t => t.WorkItemId).ToList()); // Find new user to crawl
                        if (!workItemId.HasValue)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(1));
                            continue;
                        }

                        tracker.WorkItemId = workItemId.Value;
                        var task = Task.Run(() => Harvest(tracker)); // Start async worker
                        trackers[task] = tracker;

                        if (count++ % 1000 == 0)
                        {
                            Console.WriteLine($"[{DateTime.UtcNow}] Total workers: {trackers.Count} (Completed: {trackers.Where(t => t.Key.IsCompleted).Count()})");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Harvest worker thread died: " + ex.ToString());
                }
                await Task.Delay(TimeSpan.FromSeconds(5));
            }
        }

        public TwitterClient GetClientFromToken(TwitterToken token)
        {
            var twitterConfig = TwitterConfiguration.Value;

            TwitterClient client;

            if (!string.IsNullOrWhiteSpace(token.AccessToken))
            {
                client = new TwitterClient(twitterConfig.ConsumerKey, twitterConfig.ConsumerSecret, token.AccessToken, token.AccessSecret);
            }
            else
            {
                client = new TwitterClient(twitterConfig.ConsumerKey, twitterConfig.ConsumerSecret, token.BearerToken);
            }

            client.Config.HttpRequestTimeout = TimeSpan.FromSeconds(60);
            client.Config.RateLimitTrackerMode = RateLimitTrackerMode.TrackOnly;
            return client;
        }

        public async Task<TwitterToken> GetNextToken(List<long> activeIds)
        {
            if (AvailableTokens.TryDequeue(out var result))
            {
                return result;
            }

            await GetMoreTokens(activeIds);

            if (AvailableTokens.TryDequeue(out result))
            {
                return result;
            }
            return null;
        }

        public async Task GetMoreTokens(List<long> activeIds)
        {
            var tokens = await Context.TwitterTokens
                .Where(t => !activeIds.Contains(t.Id) && t.NextFriendsRequest < DateTime.UtcNow)
                .OrderBy(t => t.NextFriendsRequest)
                .Take(100)
                .ToListAsync();

            foreach (var token in tokens)
            {
                AvailableTokens.Enqueue(token);
            }
        }

        public async Task<long?> GetNextWorkItem(List<long> activeIds)
        {
            if (WorkItems.TryDequeue(out var result))
            {
                return result;
            }

            var moreWork = await GetNextWorkItemsToQueue(activeIds);

            foreach (var item in moreWork)
            {
                WorkItems.Enqueue(item);
            }

            if (WorkItems.TryDequeue(out result))
            {
                return result;
            }

            return null;
        }

        public async Task<List<long>> GetNextWorkItemsToQueue(List<long> activeIds)
        {
            var workItems = await Context.WorkItems
                .Where(t => !activeIds.Contains(t.Id))
                .OrderBy(t => t.Id)
                .Take(100)
                .Select(t => t.Id)
                .ToListAsync();

            return workItems;
        }


        public async Task<bool> Harvest(TwitterClientTracker tracker)
        {
            using var dbContext = await ContextFactory.CreateDbContextAsync();
            var workItem = await dbContext.WorkItems.FindAsync(tracker.WorkItemId);

            bool result = await HarvestInner(dbContext, workItem, tracker);

            if (result)
            {
                dbContext.WorkItems.Remove(workItem);
                await dbContext.SaveChangesAsync();
            }

            return result;
        }

        public async Task<bool> HarvestInner(FurlandContext dbContext, WorkItem workItem, TwitterClientTracker tracker)
        {
            BasicHarvestUser dbUser = await dbContext.Users
                .Where(t => t.Id == workItem.UserId)
                .Select(t => new BasicHarvestUser()
                {
                    Deleted = t.Deleted,
                    FollowersCollected = t.FollowersCollected,
                    FriendsCollected = t.FriendsCollected,
                    Protected = t.Protected,
                    ScreenName = t.ScreenName,
                })
                .FirstOrDefaultAsync();

            if (dbUser != null && (dbUser.Deleted || string.IsNullOrEmpty(dbUser.ScreenName)))
            {
                await dbContext.Database.ExecuteSqlInterpolatedAsync(@$"UPDATE users SET ""lastUpdate""=now(),deleted=true WHERE ""id""={workItem.UserId}");
                // dbUser.LastUpdate = DateTime.UtcNow;
                // await dbContext.SaveChangesAsync();
                return true;
            }

            if (workItem.Type == "user")
            {
                IUser friend = null;
                try
                {
                    friend = await tracker.TwitterClient.Users.GetUserAsync(workItem.UserId);
                    // TODO: Do we call the user API too often?
                    await UserService.CollectUser(dbContext, friend);
                }
                catch (TwitterException ex) when (ex.StatusCode == 404 && ex.Content.Contains("User not found"))
                {
                    await UserService.AddDeletedUser(dbContext, workItem.UserId);
                }
                catch (TwitterException ex) when (ex.StatusCode == 403 && ex.Content.Contains("User has been suspended"))
                {
                    await UserService.AddDeletedUser(dbContext, workItem.UserId);
                }
                catch (TwitterException ex) when (ex.StatusCode == 401 && ex.Content.Contains("Unauthorized"))
                {
                    await UserService.AddDeletedUser(dbContext, workItem.UserId);
                }
                return true;
            }

            if (dbUser.Protected)
            {
                return true;
            }
            try
            {
                var iterator = GetIterator(workItem.Type);
                if (!iterator.UserCanUpdate(dbUser))
                {
                    return true;
                }

                return await HarvestFollowers(dbContext, iterator, tracker);
            }
            catch (TwitterException ex) when (ex.StatusCode == 401 && ex.Content.Contains("Unauthorized"))
            {
                // User has their account set to private? 
                await dbContext.Database.ExecuteSqlInterpolatedAsync(@$"UPDATE users SET ""protected""=true WHERE ""id""={workItem.UserId}");
                return true;
            }
            catch (TwitterException ex) when (ex.StatusCode == 401 && ex.Content.Contains("Not authorized"))
            {
                // User has their account set to private? 
                await dbContext.Database.ExecuteSqlInterpolatedAsync(@$"UPDATE users SET ""protected""=true WHERE ""id""={workItem.UserId}");
                return true;
            }
            catch (TwitterException ex) when (ex.StatusCode == 404 && ex.Content.Contains("Sorry, that page does not exist"))
            {
                // User has their account set to private? 
                await dbContext.Database.ExecuteSqlInterpolatedAsync(@$"UPDATE users SET ""protected""=true WHERE ""id""={workItem.UserId}");
                return true;
            }
        }

        public UserRelationIterator GetIterator(string type)
        {
            if (type == "followers")
            {
                return new UserFollowersIterator();
            }
            else if (type == "friends")
            {
                return new UserFriendIterator();
            }

            throw new Exception();
        }

        public async Task<bool> HarvestFollowers(FurlandContext dbContext, UserRelationIterator userRelations, TwitterClientTracker tracker)
        {
            var workItem = await dbContext.WorkItems.FindAsync(tracker.WorkItemId);
            var iterator = userRelations.GetIterator(tracker.TwitterClient, workItem.UserId, workItem.Cursor);

            if (workItem.UserIds == null)
            {
                workItem.UserIds = new List<long>();
            }

            while (!iterator.Completed && tracker.CanWork())
            {
                tracker.UseCall();
                var page = await iterator.NextPageAsync();
                workItem.UserIds.AddRange(page);
            }

            if (iterator.Completed)
            {
                using var trans = dbContext.Database.BeginTransaction();
                await userRelations.Save(dbContext, workItem.UserId, workItem.UserIds);
                await dbContext.SaveChangesAsync();
                await trans.CommitAsync();
                return true;
            }
            else
            {
                workItem.Cursor = iterator.NextCursor;
                await dbContext.SaveChangesAsync();
                return false;
            }
        }
    }

    public abstract class UserRelationIterator
    {
        public abstract ITwitterIterator<long> GetIterator(TwitterClient twitterClient, long userId, string cursor);

        public abstract Task Save(FurlandContext context, long userId, List<long> relationIds);

        public abstract bool UserCanUpdate(BasicHarvestUser user);
    }

    public class UserFriendIterator : UserRelationIterator
    {
        public override ITwitterIterator<long> GetIterator(TwitterClient twitterClient, long userId, string cursor)
        {
            var parameter = new GetFriendIdsParameters(userId)
            {
                Cursor = cursor,
            };
            return twitterClient.Users.GetFriendIdsIterator(parameter);
        }

        public override async Task Save(FurlandContext context, long userId, List<long> relationIds)
        {
            await context.Database.ExecuteSqlInterpolatedAsync(@$"UPDATE users SET ""friendsCollected""=now() WHERE ""id""={userId}");
            await context.Database.ExecuteSqlInterpolatedAsync(@$"DELETE FROM ""userRelations"" WHERE ""userId""={userId} and ""type""='friends'");
            context.UserRelations.Add(new UserRelations()
            {
                UserId = userId,
                Type = "friends",
                List = relationIds.OrderBy(t => t).ToList(),
            });
        }

        public override bool UserCanUpdate(BasicHarvestUser user)
        {
            return user.FriendsCollected == null || user.FriendsCollected + TimeSpan.FromDays(30) < DateTime.UtcNow;
        }
    }

    public class UserFollowersIterator : UserRelationIterator
    {
        public override ITwitterIterator<long> GetIterator(TwitterClient twitterClient, long userId, string cursor)
        {
            var parameter = new GetFollowerIdsParameters(userId)
            {
                Cursor = cursor,
            };
            return twitterClient.Users.GetFollowerIdsIterator(parameter);
        }

        public override async Task Save(FurlandContext context, long userId, List<long> relationIds)
        {
            await context.Database.ExecuteSqlInterpolatedAsync(@$"UPDATE users SET ""followersCollected""=now() WHERE ""id""={userId}");
            await context.Database.ExecuteSqlInterpolatedAsync(@$"DELETE FROM ""userRelations"" WHERE ""userId""={userId} and ""type""='followers'");
            context.UserRelations.Add(new UserRelations()
            {
                UserId = userId,
                Type = "followers",
                List = relationIds.OrderBy(t => t).ToList(),
            });
        }

        public override bool UserCanUpdate(BasicHarvestUser user)
        {
            return user.FollowersCollected == null || user.FollowersCollected + TimeSpan.FromDays(30) < DateTime.UtcNow;
        }
    }

    public class TwitterClientTracker
    {
        public TwitterToken Token { get; }
        public TwitterClient TwitterClient { get; }

        public long WorkItemId { get; set; }

        public int CallsLeft = 15;

        public TwitterClientTracker(TwitterToken token, TwitterClient twitterClient)
        {
            Token = token;
            TwitterClient = twitterClient;
        }

        public void UseCall()
        {
            Interlocked.Decrement(ref CallsLeft);
        }

        public bool CanWork()
        {
            return Thread.VolatileRead(ref CallsLeft) > 0;
        }
    }
}
