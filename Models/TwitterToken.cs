namespace FurlandGraph.Models
{
    public class TwitterToken
    {
        public long Id { get; set; }

        public string BearerToken { get; set; }

        public string AccessToken { get; set; }

        public string AccessSecret { get; set; }

        public DateTime NextFriendsRequest { get; set; }
    }
}
