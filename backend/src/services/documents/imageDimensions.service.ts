export type SupportedImageDimensions = {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxJpegHeaderBytes = 1024 * 1024;

function dimensions(width: number, height: number, format: SupportedImageDimensions["format"]): SupportedImageDimensions | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return null;
  return { width, height, format };
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) return null;
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR" || buffer.readUInt32BE(8) < 13) return null;
  return dimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20), "png");
}

function isJpegSofMarker(marker: number) {
  return (marker >= 0xc0 && marker <= 0xc3)
    || (marker >= 0xc5 && marker <= 0xc7)
    || (marker >= 0xc9 && marker <= 0xcb)
    || (marker >= 0xcd && marker <= 0xcf);
}

function readJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const limit = Math.min(buffer.length, maxJpegHeaderBytes);
  let offset = 2;
  while (offset + 3 <= limit) {
    if (buffer[offset] !== 0xff) return null;
    while (offset < limit && buffer[offset] === 0xff) offset += 1;
    if (offset >= limit) return null;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > limit) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > limit) return null;
    if (isJpegSofMarker(marker)) {
      if (segmentLength < 8) return null;
      return dimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3), "jpeg");
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpChunkHeader(buffer: Buffer) {
  if (buffer.length < 20 || buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  if (buffer.readUInt32LE(4) !== buffer.length - 8) return null;
  const chunkLength = buffer.readUInt32LE(16);
  const paddedChunkLength = chunkLength + (chunkLength % 2);
  if (paddedChunkLength > buffer.length - 20) return null;
  return { chunk: buffer.subarray(12, 16).toString("ascii"), chunkLength };
}

function readWebpDimensions(buffer: Buffer) {
  const header = readWebpChunkHeader(buffer);
  if (!header) return null;
  const { chunk, chunkLength } = header;
  if (chunk === "VP8X") {
    if (chunkLength < 10 || buffer.length < 30) return null;
    return dimensions(1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3), "webp");
  }
  if (chunk === "VP8 ") {
    if (chunkLength < 10 || buffer.length < 30 || buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return dimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff, "webp");
  }
  if (chunk === "VP8L") {
    if (chunkLength < 5 || buffer.length < 25 || buffer[20] !== 0x2f) return null;
    const width = 1 + (buffer[21] | ((buffer[22] & 0x3f) << 8));
    const height = 1 + ((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10));
    return dimensions(width, height, "webp");
  }
  return null;
}

export function readSupportedImageDimensions(buffer: Buffer): SupportedImageDimensions | null {
  return readPngDimensions(buffer) || readJpegDimensions(buffer) || readWebpDimensions(buffer);
}
