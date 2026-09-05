const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, '../../src-tauri/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate a valid PNG buffer of width x height with solid color (RGBA: 24, 119, 242, 255)
function createPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // Raw image data with filter byte (0) before each scanline
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const offset = y * scanlineLength;
    rawData[offset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      rawData[pxOffset] = 24;     // R
      rawData[pxOffset + 1] = 119; // G
      rawData[pxOffset + 2] = 242; // B
      rawData[pxOffset + 3] = 255; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crc]);
}

// Generate icons
fs.writeFileSync(path.join(iconsDir, '32x32.png'), createPng(32, 32));
fs.writeFileSync(path.join(iconsDir, '128x128.png'), createPng(128, 128));
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), createPng(256, 256));
fs.writeFileSync(path.join(iconsDir, 'icon.png'), createPng(512, 512));

// Generate valid ICO wrapper containing 32x32 PNG
const png32 = createPng(32, 32);
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
icoHeader.writeUInt16LE(1, 4); // 1 Image

const icoDir = Buffer.alloc(16);
icoDir[0] = 32; // Width
icoDir[1] = 32; // Height
icoDir[2] = 0;  // Colors
icoDir[3] = 0;  // Reserved
icoDir.writeUInt16LE(1, 4);  // Color planes
icoDir.writeUInt16LE(32, 6); // Bits per pixel
icoDir.writeUInt32LE(png32.length, 8); // Image size
icoDir.writeUInt32LE(22, 12); // Image data offset (6 + 16)

fs.writeFileSync(path.join(iconsDir, 'icon.ico'), Buffer.concat([icoHeader, icoDir, png32]));
fs.writeFileSync(path.join(iconsDir, 'icon.icns'), createPng(512, 512));

console.log('Icons generated successfully in', iconsDir);
