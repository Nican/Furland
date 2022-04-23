using SimpleMigrations;

namespace FurlandGraph.Migrations
{
    [Migration(5, "LastRequest")]
    public class LastRequest : Migration
    {
        protected override void Up()
        {
            Execute(@"ALTER TABLE public.""graphCache"" 
    ADD COLUMN ""lastRequest"" timestamp");
        }

        protected override void Down()
        {
        }

    }
}
