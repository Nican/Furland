namespace FurlandGraph.Models
{
    public class User
    {
        public long Id { get; set; }

        public string Name { get; set; }

        public string ProfileImageUrl { get; set; }

        public string ScreenName { get; set; }

        public bool Suspended { get; set; }

        public long FollowersCount { get; set; }

        public long FriendsCount { get; set; }

        public bool Protected { get; set; }

        public bool Verified { get; set; }

        public bool Deleted { get; set; }

        public string ProfileImageUrlFullSize { get; set; }

        public long StatusesCount { get; set; }

        /// <summary>
        /// Time of the last tweet
        /// </summary>
        public DateTime? LastStatus { get; set; }

        public DateTime? FollowersCollected { get; set; }

        public DateTime? FriendsCollected { get; set; }

        /// <summary>
        /// When the user data was last updated
        /// </summary>
        public DateTime LastUpdate { get; set; }
    }
}
