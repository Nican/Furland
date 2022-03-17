using MessagePack;

namespace FurlandGraph.Models
{
    public class GraphCache
    {
        public long UserId { get; set; }

        public string Type { get; set; }

        public byte[] Data { get; set; }
    }

    [MessagePackObject]
    public class GraphCacheItem
    {
        [Key("friends")]
        public List<GraphCacheFriendItem> Friends { get; set; }

        [Key("mutualMatrix")]
        public List<long> MutualMatrix { get; set; }
    }

    [MessagePackObject]
    public class GraphCacheFriendItem
    {
        [Key("id")]
        public long Id { get; set; }

        [Key("screenName")]
        public string ScreenName { get; set; }

        [Key("profileImageUrl")]
        public string ProfileImageUrl { get; set; }
    }
}
