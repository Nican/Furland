﻿using FurlandGraph.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tweetinvi;
using Tweetinvi.Exceptions;
using Tweetinvi.Iterators;
using Tweetinvi.Models;
using Tweetinvi.Parameters;

namespace FurlandGraph.Services
{
    public class HarvestService
    {
        public HarvestService(FurlandContext context, IDbContextFactory<FurlandContext> contextFactory, IOptions<TwitterConfiguration> twitterConfiguration, UserService userService)
        {
            Context = context;
            ContextFactory = contextFactory;
            TwitterConfiguration = twitterConfiguration;
            UserService = userService;
        }

        public FurlandContext Context { get; }
        public IDbContextFactory<FurlandContext> ContextFactory { get; }
        public IOptions<TwitterConfiguration> TwitterConfiguration { get; }
        public UserService UserService { get; }

        public async Task ParallelRun()
        {
            try
            {
                int maxWorkers = 100;
                var trackers = new Dictionary<Task<bool>, TwitterClientTracker>();

                while (true)
                {
                    TwitterClientTracker tracker = null;
                    var completedTask = trackers.Keys.FirstOrDefault(t => t.IsCompleted); // Check if any of the workers is finished

                    if (completedTask == null)
                    {
                        if (trackers.Count >= maxWorkers) // If no workers are finished, see if we can create a new one
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
                                var workItemToRemove = await Context.WorkItems.FindAsync(tracker.WorkItemId);
                                Context.WorkItems.Remove(workItemToRemove);
                                await Context.SaveChangesAsync();
                            }
                        }
                        catch (TwitterException ex) when (ex.Message.Contains("Rate limit exceeded (88)"))
                        {
                            tracker.Token.NextFriendsRequest = DateTime.UtcNow + TimeSpan.FromMinutes(15); // API Key has no calls left
                            await Context.SaveChangesAsync();
                            tracker = null;
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(ex.ToString());
                        }
                    }

                    if (tracker != null && !tracker.CanWork()) // API key has no calls left
                    {
                        tracker.Token.NextFriendsRequest = DateTime.UtcNow + TimeSpan.FromMinutes(15);
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
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.ToString());
            }
        }

        public TwitterClient GetClientFromToken(TwitterToken token)
        {
            var twitterConfig = TwitterConfiguration.Value;

            if (string.IsNullOrWhiteSpace(token.BearerToken))
            {
                return new TwitterClient(twitterConfig.ConsumerKey, twitterConfig.ConsumerSecret, token.AccessToken, token.AccessSecret);
            }

            return new TwitterClient(twitterConfig.ConsumerKey, twitterConfig.ConsumerSecret, token.BearerToken);
        }

        public async Task<TwitterToken> GetNextToken(List<long> activeIds)
        {
            return await this.Context.TwitterTokens
                .Where(t => !activeIds.Contains(t.Id) && t.NextFriendsRequest < DateTime.UtcNow)
                .OrderBy(t => t.NextFriendsRequest)
                .FirstOrDefaultAsync();
        }

        public async Task<long?> GetNextWorkItem(List<long> activeIds)
        {
            var workItem = await this.Context.WorkItems
                .Where(t => !activeIds.Contains(t.Id))
                .OrderBy(t => t.Id)
                .FirstOrDefaultAsync();
            return workItem?.Id;
        }

        public async Task<bool> Harvest(TwitterClientTracker tracker)
        {
            using var dbContext = await ContextFactory.CreateDbContextAsync();
            var workItem = await dbContext.WorkItems.FindAsync(tracker.WorkItemId);
            var iterator = GetIterator(workItem.Type);
            var dbUser = await dbContext.Users.FindAsync(workItem.UserId);

            if (dbUser != null && dbUser.Deleted)
            {
                return true;
            }

            try
            {
                var friend = await tracker.TwitterClient.Users.GetUserAsync(workItem.UserId);
                // TODO: Do we call the user API too often?
                await UserService.CollectUser(dbContext, friend);

                if (friend.Protected)
                {
                    return true;
                }
            }
            catch (TwitterException ex) when (ex.StatusCode == 404 && ex.Content.Contains("User not found"))
            {
                await UserService.AddDeletedUser(dbContext, workItem.UserId);
                return true;
            }


            if (!iterator.UserCanUpdate(dbUser))
            {
                dbUser.FriendsCollected = DateTime.UtcNow;
                await dbContext.SaveChangesAsync();
                return true;
            }

            return await HarvestFollowers(dbContext, iterator, tracker);
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
            }
            else
            {
                workItem.Cursor = iterator.NextCursor;
            }

            return iterator.Completed;
        }
    }

    public abstract class UserRelationIterator
    {
        public abstract ITwitterIterator<long> GetIterator(TwitterClient twitterClient, long userId, string cursor);

        public abstract Task Save(FurlandContext context, long userId, List<long> relationIds);

        public abstract bool UserCanUpdate(User user);
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
            var dbUser = await context.Users.FindAsync(userId);
            dbUser.FriendsCollected = DateTime.UtcNow;
            context.Database.ExecuteSqlInterpolated(@$"DELETE FROM ""userFriends"" WHERE ""userId""={userId}");
            context.UserFriends.AddRange(relationIds.Distinct().Select(t =>
            {
                return new UserFriend() { UserId = userId, FriendId = t };
            }));
        }

        public override bool UserCanUpdate(User user)
        {
            if (user.FriendsCount > 6000)
            {
                return false;
            }

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
            var dbUser = await context.Users.FindAsync(userId);
            dbUser.FollowersCollected = DateTime.UtcNow;
            await context.Database.ExecuteSqlInterpolatedAsync(@$"DELETE FROM ""userFollowers"" WHERE ""userId""={userId}");
            context.UserFollowers.AddRange(relationIds.Distinct().Select(t =>
            {
                return new UserFollower() { UserId = userId, FollowerId = t };
            }));
        }

        public override bool UserCanUpdate(User user)
        {
            if (user.FollowersCount > 50000)
            {
                return false;
            }

            return user.FollowersCollected == null || user.FollowersCollected + TimeSpan.FromDays(30) < DateTime.UtcNow;
        }
    }

    public class TwitterClientTracker
    {
        public TwitterToken Token { get; }
        public TwitterClient TwitterClient { get; }
        // public WorkItem WorkItem { get; set; }

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
            Console.WriteLine($"Tracker use call: {CallsLeft}");

            if (CallsLeft <= 1)
            {

            }
        }

        public bool CanWork()
        {
            return Thread.VolatileRead(ref CallsLeft) > 0;
        }
    }
}