using FurlandGraph.Models;
using FurlandGraph.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace FurlandGraph
{

    // sudo docker exec -it furland pg_dump --username=postgres -n "public" furland > furland.dump
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            // services.AddRazorPages();

            services.AddResponseCompression(options =>
            {
                options.Providers.Add<BrotliCompressionProvider>();
                options.Providers.Add<GzipCompressionProvider>();

                options.MimeTypes.Append("application/msgpack");
                options.EnableForHttps = true;
            });

            services.Configure<TwitterConfiguration>(Configuration.GetSection("Twitter"));
            services.Configure<HarvesterConfig>(Configuration.GetSection("Harvester"));

            services.AddHttpClient();
            services.AddDbContextFactory<FurlandContext>(options =>
            {
                options.UseNpgsql(Configuration.GetConnectionString("Furland"));
            });
            services.AddDbContext<FurlandContext>(options =>
            {
                options.UseNpgsql(Configuration.GetConnectionString("Furland"));
            });

            services.AddSingleton<UserService>();
            services.AddScoped<StatusService>();
            services.AddScoped<HarvestService>();
            services.AddScoped<MatrixService>();

            services.AddMvc();
            // services.AddControllersWithViews();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
            }

            app.UseStaticFiles();
            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapFallbackToFile("index.html");

                endpoints.MapControllerRoute(
                    name: "default",
                    pattern: "{controller}/{action=Index}/{id?}");
            });

            // app.UseAuthorization();

            //app.UseEndpoints(endpoints =>
            //{
            //    endpoints.MapRazorPages();
            //});
        }
    }
}
