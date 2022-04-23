using FurlandGraph.Migrations;
using FurlandGraph.Models;
using Microsoft.EntityFrameworkCore;
using SimpleMigrations;
using SimpleMigrations.DatabaseProvider;
using FurlandGraph.Services;
using System.Net;

namespace FurlandGraph
{
    public class Program
    {
        public static void Main(string[] args)
        {
            //ThreadPool.SetMaxThreads(2048, 2048);
            //ThreadPool.SetMinThreads(256, 256);
            ServicePointManager.DefaultConnectionLimit = int.MaxValue;
            ServicePointManager.UseNagleAlgorithm = true;

            var host = CreateHostBuilder(args).Build();

            using (var serviceScope = host.Services.CreateScope())
            {
                var services = serviceScope.ServiceProvider;

                // Run migrations
                using var context = services.GetRequiredService<FurlandContext>();
                var databaseProvider = new PostgresqlDatabaseProvider(context.Database.GetDbConnection());
                var migrator = new SimpleMigrator(typeof(InitialCreate).Assembly, databaseProvider);
                migrator.Load();
                migrator.MigrateToLatest();

                var databaseService = services.GetRequiredService<HarvestService>();
                _ = Task.Run(databaseService.ParallelRun);

                using (var serviceScope2 = host.Services.CreateScope())
                {
                    var matrixService = serviceScope2.ServiceProvider.GetRequiredService<MatrixService>();
                    _ = Task.Run(matrixService.RunAsync);

                    host.Run();
                }
            }
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>();
                });
    }
}
