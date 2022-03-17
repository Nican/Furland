namespace FurlandGraph.Models
{
    public class UserFriend
    {
        public long UserId { get; set; }

        public long FriendId { get; set; }

        public User User;

        public User Friend;
    }
}
