using MessagePack;

namespace FurlandGraph.Models
{
    public class GraphCache
    {
        public long UserId { get; set; }

        public string Type { get; set; }

        public byte[] Data { get; set; }

        public DateTime? FinishedAt { get; set; }

        public DateTime? LastRequest { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [MessagePackObject]
    public class GraphCacheItem
    {
        [Key("friends")]
        public List<GraphCacheFriendItem> Friends { get; set; }

        [Key("mutualMatrix")]
        public List<int> MutualMatrix { get; set; }
    }

    [MessagePackObject]
    public class GraphCacheFriendItem
    {
        [Key("id")]
        public string Id { get; set; }

        [Key("screenName")]
        public string ScreenName { get; set; }

        [Key("followersCount")]
        public long FollowersCount { get; set; }

        [Key("friendsCount")]
        public long FriendsCount { get; set; }

        [Key("statusesCount")]
        public long StatusesCount { get; set; }

        [Key("lastStatus")]
        public DateTime? LastStatus { get; set; }

        [Key("friends")]
        public List<string> Friends { get; set; }

        [Key("avatar")]
        public byte[] Avatar { get; set; }
    }
}
