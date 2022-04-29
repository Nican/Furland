import Graph from "graphology";
import { TwitterUserData } from "./Data";



export async function saveAsPng(graph: Graph, followerData: TwitterUserData[], screenName: string, stroke: boolean) {
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
  canvas.width = maxX - minX + 128;
  canvas.height = maxY - minY + 128;
  const context = canvas.getContext("2d")!;

  context.fillStyle = "black";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 2; // For the stroke

  const promises: Promise<void>[] = [];

  graph.forEachNode((_idx, attr) => {
    if (attr.fixed) {
      return;
    }

    const item = followerData[attr.id];
    let img = new Image();

    if (!item.avatar) {
      img = document.getElementById(`twitterImage${attr.id}`) as any as HTMLImageElement; // as SVGImageElement;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const x = attr.x - minX;
      const y = attr.y - minY;
      const size = attr.size;

      function onload() {
        context.save();
        try {
          // Due to a Safari bug - we can not do this
          // const img = document.getElementById(`twitterImage${attr.id}`) as any as SVGImageElement;
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
        resolve();
      }

      img.onerror = () => resolve();
      img.onload = onload;

      if (!item.avatar) {
        onload();
      } else {
        img.src = URL.createObjectURL(new Blob([item.avatar], { type: 'image/png' }));
      }
    });
    promises.push(promise);
  });

  const logoPromise = new Promise<void>((resolve) => {
    const img = new Image();
    const wx = 509, wh = 626;

    // Between 128, 1/6 the image, and 509
    const ratio = Math.max(Math.min(wx, canvas.width / 16), 128) / wx;

    img.onerror = () => resolve();
    img.onload = function () {
      try {
        context.drawImage(img, canvas.width - wx * ratio - 10, canvas.height - wh * ratio - 10, wx * ratio, wh * ratio);
      } catch (_e) {
        console.log('error: ', _e);
      }
      resolve();
    };
    img.src = 'watermark.png';
  });
  promises.push(logoPromise);

  await Promise.all(promises);

  const downloadLink = document.createElement('a');
  downloadLink.setAttribute('download', `furland_${screenName}.png`);
  const dataURL = canvas.toDataURL('image/png');
  downloadLink.setAttribute('href', dataURL);
  downloadLink.click();
}
