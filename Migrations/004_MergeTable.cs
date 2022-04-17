using SimpleMigrations;

namespace FurlandGraph.Migrations
{
    [Migration(4, "MergeTable")]
    public class MergeTable : Migration
    {
        protected override void Up()
        {
            Execute(@"
CREATE TABLE public.""userRelations"" (
  ""userId"" INT8 NOT NULL,
  ""type"" VARCHAR(32) NOT NULL,
  ""list"" _int8,
  primary key(""userId"", ""type"")
)");
            Execute(@"insert into ""userRelations""(""userId"", ""type"", ""list"") 
select ""userId"", 'friends', array_agg(""friendId"" ORDER BY ""friendId"" ASC)
from ""userFriends"" uf
group by ""userId""; ");

            Execute(@"insert into ""userRelations""(""userId"", ""type"", ""list"") 
select ""userId"", 'followers', array_agg(""followerId"" ORDER BY ""followerId"" ASC)
from ""userFollowers"" uf
group by ""userId""; ");
        }

        protected override void Down()
        {
        }

    }
}
