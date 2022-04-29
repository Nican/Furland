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
                    Id = userId,
                    Name = "",
                };
                dbContext.Users.Add(dbUser);
            }

            dbUser.LastUpdate = DateTime.UtcNow;
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

            dbUser.Name = Cleanup(user.Name) ?? "";
            dbUser.ProfileImageUrl = Cleanup(user.ProfileImageUrl);
            dbUser.FollowersCount = user.FollowersCount;
            dbUser.FriendsCount = user.FriendsCount;
            dbUser.ScreenName = Cleanup(user.ScreenName);
            dbUser.StatusesCount = user.StatusesCount;
            dbUser.Protected = user.Protected;
            dbUser.Verified = user.Verified;
            dbUser.ProfileImageUrlFullSize = Cleanup(user.ProfileImageUrlFullSize);
            dbUser.LastUpdate = DateTime.UtcNow;
            dbUser.Deleted = false;

            if (user.Status != null)
            {
                dbUser.LastStatus = user.Status.CreatedAt.UtcDateTime;
            }

            try
            {
                if (!string.IsNullOrEmpty(dbUser.ProfileImageUrl))
                {
                    var image = await HttpClient.GetByteArrayAsync(dbUser.ProfileImageUrl);
                    // var sqlParam = new NpgsqlParameter("data", image);
                    dbContext.Database.ExecuteSqlInterpolated($"INSERT INTO \"profilePics\"(id,data) VALUES ({user.Id}, {image}) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);
            }

            await dbContext.SaveChangesAsync();
            return dbUser;
        }

        private string Cleanup(string input)
        {
            // Note: https://twitter.com/Nican/status/1519372597678407681
            if (string.IsNullOrWhiteSpace(input))
            {
                return null;
            }

            return input.Replace("\0", string.Empty).Trim();
        }
    }
}
