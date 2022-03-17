using FurlandGraph.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tweetinvi;
using Tweetinvi.Exceptions;
using Tweetinvi.Iterators;
using Tweetinvi.Models;
using Tweetinvi.Parameters;

namespace FurlandGraph.Services
{
    public class MatrixService
    {
        public MatrixService(FurlandContext context)
        {
            Context = context;
        }

        public FurlandContext Context { get; }

        public static void RunAsync()
        {

            while (true)
            {


            }
        }
    }

}
