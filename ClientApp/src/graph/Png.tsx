import Graph from "graphology";



export function saveAsPng(graph: Graph, screenName: string, stroke: boolean) {
  let minX = 1000;
  let minY = 1000;
  let maxX = -1000;
  let maxY = -1000;

  graph.forEachNode((_idx, attr) => {
    if (!attr.fixed) {
      minX = Math.min(minX, attr.x - attr.size);
      minY = Math.min(minY, attr.y - attr.size);
      maxX = Math.max(maxX, attr.x + attr.size);
      maxY = Math.max(maxY, attr.y + attr.size);
    }
  });

  const canvas = document.createElement('canvas');
  canvas.width = maxX - minX;
  canvas.height = maxY - minY;
  const context = canvas.getContext("2d")!;

  context.fillStyle = "black";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 2; // For the stroke

  graph.forEachNode((_idx, attr) => {
    if (attr.fixed) {
      return;
    }

    context.save();
    try {
      const x = attr.x - minX;
      const y = attr.y - minY;
      const size = attr.size;
      const img = document.getElementById(`twitterImage${attr.id}`) as any as SVGImageElement;


      context.translate(x, y);
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2, true);
      context.closePath();

      if (stroke) {
        context.strokeStyle = attr.color;
        context.stroke();
      }

      context.clip();
      if (img) {
        context.drawImage(img, 0, 0, size, size);
      }
    } catch (_e) {
      console.log('error: ', _e);
    }
    context.restore();
  });

  const downloadLink = document.createElement('a');
  downloadLink.setAttribute('download', `${screenName}.png`);
  const dataURL = canvas.toDataURL('image/png');
  downloadLink.setAttribute('href', dataURL);
  downloadLink.click();
}