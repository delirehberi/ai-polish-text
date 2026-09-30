const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const toCrc = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(toCrc);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, drawPixel) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data with filter byte 0 at each scanline
  const rowStride = width * 4 + 1;
  const rawData = Buffer.alloc(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

function drawSparkleIcon(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Smooth background rounded circle / squircle
  const cornerRadius = size * 0.22;
  const inSquircle =
    Math.abs(dx) <= (size * 0.45) &&
    Math.abs(dy) <= (size * 0.45);

  if (dist > r + 0.5) {
    return [0, 0, 0, 0];
  }

  // Modern Indigo to Violet gradient: #6366f1 -> #8b5cf6 -> #ec4899
  const gradT = (x + y) / (2 * size);
  const bgR = Math.round(99 + (236 - 99) * gradT);
  const bgG = Math.round(102 + (72 - 102) * gradT);
  const bgB = Math.round(241 + (153 - 241) * gradT);

  // Magic wand / sparkle star shape in the center
  // 4-pointed star: |dx|^0.5 + |dy|^0.5 < starSize^0.5
  const starScale = size * 0.38;
  const nx = Math.abs(dx) / starScale;
  const ny = Math.abs(dy) / starScale;
  const isStar = Math.pow(nx, 0.6) + Math.pow(ny, 0.6) <= 1.0;

  // Secondary mini sparkle
  const s2dx = (x - (cx + size * 0.22)) / (size * 0.12);
  const s2dy = (y - (cy - size * 0.22)) / (size * 0.12);
  const isStar2 = Math.pow(Math.abs(s2dx), 0.6) + Math.pow(Math.abs(s2dy), 0.6) <= 1.0;

  if (isStar || isStar2) {
    return [255, 255, 255, 255];
  }

  // Anti-aliasing boundary
  const alpha = dist > r - 0.5 ? Math.max(0, Math.min(255, Math.round((r + 0.5 - dist) * 255))) : 255;
  return [bgR, bgG, bgB, alpha];
}

const iconsDir = path.join(__dirname);
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const pngBuf = createPng(size, size, (x, y, w, h) => drawSparkleIcon(x, y, size));
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, pngBuf);
  console.log(`Generated ${filePath} (${size}x${size}, ${pngBuf.length} bytes)`);
});
