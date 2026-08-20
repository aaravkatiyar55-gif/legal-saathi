import assert from "node:assert/strict";
import { readSupportedImageDimensions } from "./imageDimensions.service";

const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
assert.deepEqual(readSupportedImageDimensions(onePixelPng), { width: 1, height: 1, format: "png" });

const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
]);
assert.deepEqual(readSupportedImageDimensions(jpeg), { width: 3, height: 2, format: "jpeg" });

const webp = Buffer.alloc(30);
webp.write("RIFF", 0, "ascii");
webp.writeUInt32LE(22, 4);
webp.write("WEBP", 8, "ascii");
webp.write("VP8X", 12, "ascii");
webp.writeUInt32LE(10, 16);
webp[24] = 1; // width minus one: 2px
webp[27] = 2; // height minus one: 3px
assert.deepEqual(readSupportedImageDimensions(webp), { width: 2, height: 3, format: "webp" });

const vp8Webp = Buffer.alloc(30);
vp8Webp.write("RIFF", 0, "ascii");
vp8Webp.writeUInt32LE(22, 4);
vp8Webp.write("WEBP", 8, "ascii");
vp8Webp.write("VP8 ", 12, "ascii");
vp8Webp.writeUInt32LE(10, 16);
vp8Webp.set([0x9d, 0x01, 0x2a], 23);
vp8Webp.writeUInt16LE(4, 26);
vp8Webp.writeUInt16LE(5, 28);
assert.deepEqual(readSupportedImageDimensions(vp8Webp), { width: 4, height: 5, format: "webp" });

const vp8lWebp = Buffer.alloc(26);
vp8lWebp.write("RIFF", 0, "ascii");
vp8lWebp.writeUInt32LE(18, 4);
vp8lWebp.write("WEBP", 8, "ascii");
vp8lWebp.write("VP8L", 12, "ascii");
vp8lWebp.writeUInt32LE(5, 16);
vp8lWebp.set([0x2f, 0x03, 0x00, 0x01, 0x00], 20);
assert.deepEqual(readSupportedImageDimensions(vp8lWebp), { width: 4, height: 5, format: "webp" });

const malformedWebpChunk = Buffer.from(webp);
malformedWebpChunk.writeUInt32LE(1, 16);
assert.equal(readSupportedImageDimensions(malformedWebpChunk), null, "a WebP header with an undersized VP8X chunk fails closed");

assert.equal(readSupportedImageDimensions(Buffer.from("icns", "ascii")), null, "ICNS is not an allowed image format");
assert.equal(readSupportedImageDimensions(Buffer.from([0xff, 0x0a, 0x00, 0x00])), null, "JXL is not an allowed image format");
assert.equal(readSupportedImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x01])), null, "malformed JPEG segments fail closed");

console.log("Supported image-dimension parser: PASS 9/9");
