const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, isMaskable = false) {
  // Scanlines: width * 4 bytes + 1 filter byte per row
  const rowBytes = width * 4;
  const rawData = Buffer.alloc((rowBytes + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const maxR = width * 0.46;
  const iconScale = isMaskable ? 0.35 : 0.42;

  // Colors
  const bgR = 8, bgG = 126, bgB = 131; // #087e83
  const bg2R = 18, bg2G = 161, bg2B = 156; // #12a19c
  const white = [255, 255, 255, 255];

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter: None
    const dy = (y - cy) / height;

    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / width;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);

      // Default background: smooth teal gradient
      const gradFactor = (y / height) * 0.7 + (x / width) * 0.3;
      const r = Math.round(bgR + (bg2R - bgR) * gradFactor);
      const g = Math.round(bgG + (bg2G - bgG) * gradFactor);
      const b = Math.round(bgB + (bg2B - bgB) * gradFactor);
      let pixel = [r, g, b, 255];

      // Draw stylized dental tooth mark
      // Center box:
      const nx = (x - cx) / (width * iconScale);
      const ny = (y - cy) / (height * iconScale);

      // Tooth shape approximate SDF
      // Upper crown: rounded heart/arch
      // Lower roots: two tapered arches
      const inCrown = (ny >= -0.8 && ny <= 0.1 && Math.abs(nx) <= 0.75 && (nx*nx + (ny + 0.3)*(ny + 0.3) < 0.65));
      const inLeftRoot = (ny > 0.0 && ny <= 0.85 && nx >= -0.7 && nx <= -0.1 && (Math.abs(nx + 0.35) < 0.28 - (ny - 0.1)*0.2));
      const inRightRoot = (ny > 0.0 && ny <= 0.85 && nx >= 0.1 && nx <= 0.7 && (Math.abs(nx - 0.35) < 0.28 - (ny - 0.1)*0.2));
      if (inCrown || inLeftRoot || inRightRoot) {
        pixel = white;
      }

      rawData[offset++] = pixel[0];
      rawData[offset++] = pixel[1];
      rawData[offset++] = pixel[2];
      rawData[offset++] = pixel[3];
    }
  }

  // Header chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // No interlace

  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', zlib.deflateSync(rawData, { level: 9 }));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSig, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate 192x192
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, false));
console.log('Created pwa-192x192.png');

// Generate 512x512
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, false));
console.log('Created pwa-512x512.png');

// Generate maskable 512x512
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));
console.log('Created pwa-maskable-512x512.png');

// Generate apple-touch-icon 180x180
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, false));
console.log('Created apple-touch-icon.png');

// Also create favicon.ico
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createPng(64, 64, false));
console.log('Created favicon.ico');

console.log('All PWA icons successfully generated!');
