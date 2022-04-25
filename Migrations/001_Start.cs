using SimpleMigrations;

namespace FurlandGraph.Migrations
{
    [Migration(1, "Start")]
    public class InitialCreate : Migration
    {
        protected override void Up()
        {
            Execute(@"CREATE TABLE public.""users"" (
  id INT8 NOT NULL,
  name VARCHAR(256) NOT NULL,
  ""profileImageUrl"" VARCHAR(512),
  ""screenName"" VARCHAR(512),
  ""suspended"" boolean DEFAULT false,
  ""followersCount"" INT8,
  ""friendsCount"" INT8,
  ""protected"" boolean DEFAULT false,
  ""verified"" boolean DEFAULT false,
  ""profileImageUrlFullSize"" VARCHAR(512),
  ""statusesCount"" INT8 DEFAULT 0,
  ""followersCollected"" timestamp,
  ""friendsCollected"" timestamp,
  ""deleted"" bool not null default false,
  CONSTRAINT ""primary"" PRIMARY KEY (id)
)");

            Execute(@"CREATE TABLE public.""userFriends"" (
  ""userId"" INT8 NOT NULL,
  ""friendId"" INT8 NOT NULL,
  CONSTRAINT ""userFriends_primary"" PRIMARY KEY (""userId"", ""friendId"")
)");

            Execute(@"CREATE TABLE public.""userFollowers"" (
  ""userId"" INT8 NOT NULL,
  ""followerId"" INT8 NOT NULL,
  CONSTRAINT ""userFollowers_primary"" PRIMARY KEY (""userId"", ""followerId"")
)");
            Execute(@"CREATE TABLE public.""twitterToken"" (
    id INT8 PRIMARY KEY,
  ""bearerToken"" VARCHAR (1024) NOT NULL,
  ""nextFriendsRequest"" timestamp NOT NULL,
  ""accessToken"" VARCHAR (1024) NOT NULL,
  ""accessSecret"" VARCHAR (1024) NOT NULL
)");

            Execute(@"CREATE TABLE public.""workItem"" (
    ""id"" serial PRIMARY KEY,
    ""type"" VARCHAR (64) NOT NULL,
    ""userId"" INT8 NOT NULL,
    ""forUser"" INT8 NOT NULL,
    ""cursor"" VARCHAR (512),
    ""userIds"" JSONB
)");

            Execute(@"CREATE TABLE public.""profilePics"" (
    id INT8 PRIMARY KEY,
  ""data"" bytea NOT NULL
)");
        }

        protected override void Down()
        {
            Execute("DROP TABLE \"users\"");
            Execute("DROP TABLE \"userFriends\"");
            Execute("DROP TABLE \"userFollowers\"");
            Execute("DROP TABLE \"twitterToken\"");
            Execute("DROP TABLE \"workItem\"");
            Execute("DROP TABLE \"profilePics\"");
        }
    }
}
