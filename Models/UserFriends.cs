namespace FurlandGraph.Models
{
    public class UserRelations
    {
        public long UserId { get; set; }

        public string Type { get; set; }

        public List<long> List { get; set; }

        public User User;
    }
}
