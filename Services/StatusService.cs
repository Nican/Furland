﻿using FurlandGraph.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tweetinvi;

namespace FurlandGraph.Services
{
    public class LoadStatus
    {
        public long Id { get; set; }
        public string ScreenName { get; set; }
        public long TotalWorkItems { get; set; }
        public long NeedCollectedCount { get; set; }
        public bool Finished { get; set; }
        public string Error { get; set; }
        public long Stage { get; set; }
        public long? RequesterId { get; set; }
    }

    public class StatusService
    {
        public StatusService(FurlandContext context, IOptions<TwitterConfiguration> twitterConfiguration, UserService userService)
        {
            Context = context;
            TwitterConfiguration = twitterConfiguration;
            UserService = userService;
        }

        public FurlandContext Context { get; }
        public IOptions<TwitterConfiguration> TwitterConfiguration { get; }
        public UserService UserService { get; }

        public DateTime Past = DateTime.UtcNow - TimeSpan.FromDays(30);

        public async Task<LoadStatus> CheckStatus(string username, string nodes, string relationship, long? requesterId)
        {
            bool canAddWork = requesterId.HasValue ? (await Context.WorkItems.CountAsync(t => t.ForUser == requesterId) < 100) : false;
            var user = await Context.Users.Where(t => t.ScreenName == username).FirstOrDefaultAsync();
            if (user == null)
            {
                user = await LoadUserProfile(username);
            }

            if (user.Protected)
            {
                throw new AccountIsProtectedException();
            }

            if (nodes == "friends" && user.FriendsCount > 10000)
            {
                throw new TooManyNodesExepction("Can not render more than 10,000 nodes");
            }
            else if (nodes == "followers" && user.FollowersCount > 10000)
            {
                throw new TooManyNodesExepction("Can not render more than 10,000 nodes");
            }

            if (relationship == "friends" && user.FriendsCount > MatrixService.MaxAccountSize)
            {
                throw new TooManyNodesExepction("Can not gather more than 50,000 edges");
            }
            else if (relationship == "followers" && user.FollowersCount > MatrixService.MaxAccountSize)
            {
                throw new TooManyNodesExepction("Can not gather more than 50,000 edges");
            }


            var userFriends = await LoadUserFriends(user, nodes, requesterId, canAddWork);
            if (userFriends != null)
            {
                return userFriends;
            }

            var relationList = await Context.UserRelations
                .Where(t => t.UserId == user.Id && t.Type == nodes)
                .Select(t => t.List)
                .FirstAsync();

            var followers = await Context.Users
                .Where(t => relationList.Contains(t.Id))
                .ToDictionaryAsync(t => t.Id);

            var userProfiles = await LoadUserProfiles(user, relationList, followers, requesterId, canAddWork);
            if (userProfiles != null)
            {
                return userProfiles;
            }

            var friendFriends = await LoadFriendFriends(user, relationship, followers, requesterId, canAddWork);
            if (friendFriends != null)
            {
                return friendFriends;
            }

            return await CalculateGraph(user, nodes, relationship, requesterId, canAddWork);
        }

        public async Task<User> LoadUserProfile(string screenName)
        {
            var twitterConfig = TwitterConfiguration.Value;
            var token = await this.Context.TwitterTokens
                .Where(t => t.AccessToken != "")
                .OrderBy(t => t.NextFriendsRequest)
                .FirstOrDefaultAsync();

            TwitterClient client = new TwitterClient(twitterConfig.ConsumerKey, twitterConfig.ConsumerSecret, token.AccessToken, token.AccessSecret);

            var user = await client.Users.GetUserAsync(screenName);
            // TODO: Do we call the user API too often?
            return await UserService.CollectUser(Context, user);
        }

        public async Task<LoadStatus> LoadUserFriends(User user, string nodes, long? requesterId, bool canAddWork)
        {
            DateTime? collectedNodes = nodes == "friends" ? user.FriendsCollected : user.FollowersCollected;
            if (!collectedNodes.HasValue || collectedNodes.Value < Past)
            {
                if (!await Context.WorkItems.Where(t => t.UserId == user.Id && t.Type == nodes).AnyAsync())
                {
                    if (canAddWork)
                    {
                        var workitem = new WorkItem()
                        {
                            ForUser = requesterId.Value,
                            UserId = user.Id,
                            Type = nodes,
                        };
                        Context.WorkItems.Add(workitem);
                        await Context.SaveChangesAsync();
                    }
                }

                return new LoadStatus()
                {
                    Id = user.Id,
                    ScreenName = user.ScreenName,
                    TotalWorkItems = await Context.WorkItems.CountAsync(),
                    NeedCollectedCount = 1,
                    Finished = false,
                    Stage = 1,
                    RequesterId = requesterId,
                };
            }

            return null;
        }

        public async Task<LoadStatus> LoadUserProfiles(User user, List<long> relationList, Dictionary<long, User> followers, long? requesterId, bool canAddWork)
        {
            var needUserCollect = relationList
                 .Where(userId =>
                 {
                     if (!followers.TryGetValue(userId, out var user))
                     {
                         return true;
                     }

                     if (user.Deleted)
                     {
                         return false;
                     }

                     return user.LastUpdate < Past;
                 }).OrderBy(t => t).ToList();

            // Stage 2 - Collect user profiles
            if (needUserCollect.Count > 0)
            {
                if (canAddWork)
                {
                    // Do not add work items that already exist as an work item
                    var doNotAdd = await Context.WorkItems
                    .Where(t => needUserCollect.Contains(t.UserId) && t.Type == "user")
                    .Select(t => t.UserId)
                    .ToListAsync();

                    Context.WorkItems.AddRange(needUserCollect.Take(2000).Except(doNotAdd).Select(t =>
                    {
                        return new WorkItem()
                        {
                            ForUser = user.Id,
                            UserId = t,
                            Type = "user",
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
                    NeedCollectedCount = needUserCollect.Count,
                    Finished = false,
                    Stage = 2,
                    RequesterId = requesterId,
                };
            }

            return null;
        }

        public async Task<LoadStatus> LoadFriendFriends(User user, string relationship, Dictionary<long, User> followers, long? requesterId, bool canAddWork)
        {
            // Stage 3 - Collect user followers
            var needCollected = followers.Values
                .Where(t => !string.IsNullOrEmpty(t.ScreenName) && !t.Protected && !t.Deleted)
                .Where(t =>
                {
                    if (relationship == "friends")
                    {
                        if (t.FriendsCount > MatrixService.MaxAccountSize)
                        {
                            return false;
                        }
                        return !t.FriendsCollected.HasValue || t.FriendsCollected.Value < Past;
                    }
                    else
                    {
                        if (t.FollowersCount > MatrixService.MaxAccountSize)
                        {
                            return false;
                        }
                        return !t.FollowersCollected.HasValue || t.FollowersCollected.Value < Past;
                    }
                })
                .OrderBy(t => t.Id)
                .ToList();

            if (needCollected.Count > 0)
            {
                if (canAddWork)
                {
                    var needsCollectedIds = needCollected.Select(t => t.Id).ToList();
                    // Do not add work items that already exist as an work item
                    var doNotAdd = await Context.WorkItems
                        .Where(t => needsCollectedIds.Contains(t.UserId) && t.Type == relationship)
                        .Select(t => t.UserId)
                        .ToListAsync();

                    Context.WorkItems.AddRange(needCollected.Take(2000).Where(t => !doNotAdd.Contains(t.Id)).Select(t =>
                    {
                        return new WorkItem()
                        {
                            ForUser = requesterId.Value,
                            UserId = t.Id,
                            Type = relationship,
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
                    Stage = 3,
                    RequesterId = requesterId,
                };
            }

            return null;
        }

        public async Task<LoadStatus> CalculateGraph(User user, string nodes, string relationship, long? requesterId, bool canAddWork)
        {
            // Stage 4 - calculate friendship graph
            var workItemName = $"{nodes}+{relationship}";
            var cacheItem = await Context.GraphCache
                .Where(t => t.UserId == user.Id && t.Type == workItemName)
                .Select(t => new { t.UserId, t.FinishedAt, t.CreatedAt })
                .FirstOrDefaultAsync();

            if (cacheItem == null)
            {
                if (canAddWork)
                {
                    var newCacheItem = new GraphCache()
                    {
                        Type = workItemName,
                        UserId = user.Id,
                    };

                    Context.GraphCache.Add(newCacheItem);
                    await Context.SaveChangesAsync();
                    cacheItem = new { UserId = user.Id, FinishedAt = (DateTime?)null, CreatedAt = DateTime.UtcNow };
                }
            }

            return new LoadStatus()
            {
                Id = user.Id,
                ScreenName = user.ScreenName,
                TotalWorkItems = await Context.GraphCache.Where(t => t.FinishedAt == null).CountAsync(),
                NeedCollectedCount = 1,
                Finished = cacheItem.FinishedAt.HasValue,
                Stage = 4,
                RequesterId = requesterId,
            };
        }
    }

    public class StatusServiceException : Exception
    {
        public StatusServiceException(string error) : base(error)
        {

        }
    }

    public class AccountIsProtectedException : StatusServiceException
    {
        public AccountIsProtectedException() : base("Account is protected or deleted")
        {

        }
    }

    public class TooManyNodesExepction : StatusServiceException
    {
        public TooManyNodesExepction(string error) : base(error)
        {

        }
    }
}