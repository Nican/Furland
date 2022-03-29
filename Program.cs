using FurlandGraph.Migrations;
using FurlandGraph.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SimpleMigrations;
using SimpleMigrations.DatabaseProvider;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Tweetinvi;
using Tweetinvi.Models;
using Tweetinvi.Parameters;
using Dapper;
using FurlandGraph.Services;

namespace FurlandGraph
{
    public class Program
    {
        public static void Main(string[] args)
        {
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
