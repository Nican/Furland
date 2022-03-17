using System.ComponentModel.DataAnnotations.Schema;

namespace FurlandGraph.Models
{
    public class WorkItem
    {
        public long Id { get; set; }

        public string Type { get; set; }

        public long UserId { get; set; }

        public long ForUser { get; set; }

        [Column(TypeName = "jsonb")]
        public List<long> UserIds { get; set; }

        public string Cursor { get; set; }
    }
}
