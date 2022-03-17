using FurlandGraph.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Tweetinvi.Models;

namespace FurlandGraph.Services
{
    public class UserService
    {
        public UserService(HttpClient httpClient)
        {
            HttpClient = httpClient;
        }

        public HttpClient HttpClient { get; }

        public async Task AddDeletedUser(FurlandContext dbContext, long userId)
        {
            var dbUser = await dbContext.Users.FindAsync(userId);

            if (dbUser == null)
            {
                dbUser = new User()
                {
                    Id = userId
                };
                dbContext.Users.Add(dbUser);
            }

            dbUser.Deleted = true;

            await dbContext.SaveChangesAsync();
        }

        public async Task<User> CollectUser(FurlandContext dbContext, IUser user)
        {
            var dbUser = await dbContext.Users.FindAsync(user.Id);

            if (dbUser == null)
            {
                dbUser = new User()
                {
                    Id = user.Id
                };
                dbContext.Users.Add(dbUser);
            }

            dbUser.Name = user.Name;
            dbUser.ProfileImageUrl = user.ProfileImageUrl;
            dbUser.FollowersCount = user.FollowersCount;
            dbUser.FriendsCount = user.FriendsCount;
            dbUser.ScreenName = user.ScreenName;
            dbUser.StatusesCount = user.StatusesCount;
            dbUser.Protected = user.Protected;
            dbUser.Verified = user.Verified;
            dbUser.ProfileImageUrlFullSize = user.ProfileImageUrlFullSize;

            var image = await HttpClient.GetByteArrayAsync(dbUser.ProfileImageUrl);
            // var sqlParam = new NpgsqlParameter("data", image);
            dbContext.Database.ExecuteSqlInterpolated($"INSERT INTO \"profilePics\"(id,data) VALUES ({user.Id}, {image}) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data");

            await dbContext.SaveChangesAsync();
            return dbUser;
        }
    }
}
