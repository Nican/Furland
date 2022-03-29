using SimpleMigrations;

namespace FurlandGraph.Migrations
{
    [Migration(2, "Swag")]
    public class CacheTable : Migration
    {
        protected override void Up()
        {
             Execute(@"CREATE TABLE public.""graphCache"" (
	""userId"" int8 NOT NULL,
	""type"" varchar(64) NOT NULL,
	""data"" bytea NULL,
  finishedAt timestamp NULL,
	createdat timestamp NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT ""graphCache_pkey"" PRIMARY KEY (""userId"", ""type"")
)");
        }

        protected override void Down()
        {
            Execute("DROP TABLE \"graphCache\"");
        }
    }
}
