using SimpleMigrations;

namespace FurlandGraph.Migrations
{
    [Migration(3, "LastStatus")]
    public class LastStatus : Migration
    {
        protected override void Up()
        {
             Execute(@"ALTER TABLE public.""users"" 
    ADD COLUMN ""lastUpdate"" timestamp not null DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN ""lastStatus"" timestamp null");
        }

        protected override void Down()
        {
            Execute(@"ALTER TABLE public.""users"" DROP COLUMN ""lastUpdate"", DROP COLUMN ""lastStatus""");
        }
    }
}
