using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using System.Text.Json;

namespace FurlandGraph.Models
{
    public class FurlandContext : DbContext
    {
        public FurlandContext(DbContextOptions<FurlandContext> options)
        : base(options)
        {
        }

        public DbSet<User> Users { get; set; }

        public DbSet<UserFriend> UserFriends { get; set; }

        public DbSet<UserFollower> UserFollowers { get; set; }

        public DbSet<TwitterToken> TwitterTokens { get; set; }

        public DbSet<WorkItem> WorkItems { get; set; }

        public DbSet<GraphCache> GraphCache { get; set; }

        public DbSet<ProfilePicture> ProfilePictures { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>(entity =>
            {
                entity.ToTable("users");

                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.Name).HasColumnName("name");
                entity.Property(e => e.ProfileImageUrl).HasColumnName("profileImageUrl");
                entity.Property(e => e.ScreenName).HasColumnName("screenName");
                entity.Property(e => e.Suspended).HasColumnName("suspended");
                entity.Property(e => e.Deleted).HasColumnName("deleted");
                entity.Property(e => e.FollowersCount).HasColumnName("followersCount");
                entity.Property(e => e.FriendsCount).HasColumnName("friendsCount");
                entity.Property(e => e.Protected).HasColumnName("protected");
                entity.Property(e => e.Verified).HasColumnName("verified");
                entity.Property(e => e.ProfileImageUrlFullSize).HasColumnName("profileImageUrlFullSize");
                entity.Property(e => e.StatusesCount).HasColumnName("statusesCount");
                entity.Property(e => e.FollowersCollected).HasColumnName("followersCollected");
                entity.Property(e => e.FriendsCollected).HasColumnName("friendsCollected");
                entity.Property(e => e.LastUpdate).HasColumnName("lastUpdate");
                entity.Property(e => e.LastStatus).HasColumnName("lastStatus");
            });

            modelBuilder.Entity<UserFollower>(entity =>
            {
                entity.ToTable("userFollowers");
                entity.Property(e => e.UserId).HasColumnName("userId");
                entity.Property(e => e.FollowerId).HasColumnName("followerId");

                entity.HasKey(c => new { c.UserId, c.FollowerId });
            });

            modelBuilder.Entity<UserFriend>(entity =>
            {
                entity.ToTable("userFriends");
                entity.Property(e => e.UserId).HasColumnName("userId");
                entity.Property(e => e.FriendId).HasColumnName("friendId");

                entity.HasKey(c => new { c.UserId, c.FriendId });

                entity.HasOne(e => e.User);
                entity.HasOne(e => e.Friend);
            });

            modelBuilder.Entity<TwitterToken>(entity =>
            {
                entity.ToTable("twitterToken");
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.AccessToken).HasColumnName("accessToken");
                entity.Property(e => e.AccessSecret).HasColumnName("accessSecret");
                entity.Property(e => e.BearerToken).HasColumnName("bearerToken");
                entity.Property(e => e.NextFriendsRequest).HasColumnName("nextFriendsRequest");
            });

            modelBuilder.Entity<GraphCache>(entity =>
            {
                entity.ToTable("graphCache");
                entity.Property(e => e.UserId).HasColumnName("userId");
                entity.Property(e => e.Type).HasColumnName("type");
                entity.Property(e => e.Data).HasColumnName("data");
                entity.Property(e => e.CreatedAt).HasColumnName("createdat");
                entity.Property(e => e.FinishedAt).HasColumnName("finishedat");                
                entity.HasKey(c => new { c.UserId, c.Type });
            });

            modelBuilder.Entity<WorkItem>(entity =>
            {
                entity.ToTable("workItem");
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.Type).HasColumnName("type");
                entity.Property(e => e.UserId).HasColumnName("userId");
                entity.Property(e => e.ForUser).HasColumnName("forUser");
                entity.Property(e => e.Cursor).HasColumnName("cursor");
                entity.Property(e => e.UserIds).HasColumnName("userIds");
            });

            modelBuilder.Entity<ProfilePicture>(entity =>
            {
                entity.ToTable("profilePics");
                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.Data).HasColumnName("data");
            });
        }
    }
}
