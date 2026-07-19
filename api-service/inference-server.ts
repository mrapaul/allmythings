import { createServer } from 'node:http';
import sharp from 'sharp';

const PORT = parseInt(process.env.PORT || '8000');

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/detect') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const pipeline = sharp(buffer)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true });
    const { data, info } = await pipeline
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      width: info.width,
      height: info.height,
      size: data.length,
    }));
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', model: 'Qwen2.5-VL-3B-Instruct' }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`QwenVision inference server running on port ${PORT}`);
});
