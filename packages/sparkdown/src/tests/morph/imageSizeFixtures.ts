import type { ImageSize } from "../../workspace/utils/imageSize";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAeACgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAcJ/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnQBDGqYAAAAAAAAAD//Z";
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAYAAABe3VzdAAAAV0lEQVR4AezSwQkAMAgEQbH/nk0FB8J+hGwgr+RAxuupmsu36/hxQLogBRWkAjRvBxWkAjRvBxWkAjRvBxWkAjRvBxWkAjT/SwepU84rmG12LwrunPKvBwAA//+2Kse/AAAABklEQVQDAB5PT+3UOEwwAAAAAElFTkSuQmCC";
const WEBP_BASE64 =
  "UklGRjACAABXRUJQVlA4WAoAAAAgAAAAJwAAHQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggQgAAAJADAJ0BKigAHgA+bTaXSKQjIiElaACADYlnAM+SgH4AACv3w3AA/vCbQ//kFywuuRr//ID/kB/yA//j3xCXXzQAAA==";
const PROGRESSIVE_JPEG_BASE64 =
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAAeACgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAWAQEBAQAAAAAAAAAAAAAAAAAABQf/2gAMAwEAAhADEAAAAZwRtIAAAAA//8QAFBABAAAAAAAAAAAAAAAAAAAAQP/aAAgBAQABBQIn/8QAFBEBAAAAAAAAAAAAAAAAAAAAIP/aAAgBAwEBPwFf/8QAFBEBAAAAAAAAAAAAAAAAAAAAIP/aAAgBAgEBPwFf/8QAFBABAAAAAAAAAAAAAAAAAAAAQP/aAAgBAQAGPwIn/8QAFBABAAAAAAAAAAAAAAAAAAAAQP/aAAgBAQABPyEn/9oADAMBAAIAAwAAABD/AP8A/wD/AP8A/8QAFBEBAAAAAAAAAAAAAAAAAAAAIP/aAAgBAwEBPxBf/8QAFBEBAAAAAAAAAAAAAAAAAAAAIP/aAAgBAgEBPxBf/8QAFBABAAAAAAAAAAAAAAAAAAAAQP/aAAgBAQABPxAn/9k=";
const PROGRESSIVE_TURNED_JPEG_BASE64 =
  "/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAACgAAAADoAQAAQAAAB4AAAAAAAAA/+IB8ElDQ19QUk9GSUxFAAEBAAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAsclhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAAAAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAAHABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIAAAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBhcmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8IAEQgAHgAoAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAG/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAUH/9oADAMBAAIQAxAAAAGcEbSAAAAAP//EABQQAQAAAAAAAAAAAAAAAAAAAED/2gAIAQEAAQUCJ//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8BX//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8BX//EABQQAQAAAAAAAAAAAAAAAAAAAED/2gAIAQEABj8CJ//EABQQAQAAAAAAAAAAAAAAAAAAAED/2gAIAQEAAT8hJ//aAAwDAQACAAMAAAAQ/wD/AP8A/wD/AP/EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8QX//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8QX//EABQQAQAAAAAAAAAAAAAAAAAAAED/2gAIAQEAAT8QJ//Z";
const GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export interface ImageSizeFixture {
  name: string;
  mime: string;
  bytes: Uint8Array;
  decoded: ImageSize | null;
  read: ImageSize | null;
}

const decode64 = (text: string) => Uint8Array.from(Buffer.from(text, "base64"));
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const insert = (bytes: Uint8Array, at: number, data: Uint8Array) => cat(bytes.slice(0, at), data, bytes.slice(at));

const tiff = (orientation: number, type = 3, count = 1) => {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0, 8, 0, 0, 0, 1, 0]);
  view.setUint16(10, 0x112, true);
  view.setUint16(12, type, true);
  view.setUint32(14, count, true);
  view.setUint16(18, orientation, true);
  return bytes;
};
const bigEndianTiff = (orientation: number) =>
  new Uint8Array([77, 77, 0, 42, 0, 0, 0, 8, 0, 1, 1, 18, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
const subDirectoryTiff = (rootOrientation?: number) => {
  const bytes = new Uint8Array(70);
  const view = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0, 8, 0, 0, 0]);
  const entries: [number, number, number][] = rootOrientation === undefined ? [] : [[0x112, 3, rootOrientation]];
  entries.push([0x8769, 4, 40]);
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, value], index) => {
    const at = 10 + index * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, 1, true);
    if (type === 3) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
  });
  bytes.set(tiff(6).slice(8), 40);
  return bytes;
};

const twoOrientations = (first: number, second: number) => {
  const bytes = new Uint8Array(38);
  bytes.set(tiff(first));
  bytes[8] = 2;
  bytes.set(tiff(second).slice(10, 22), 22);
  return bytes;
};
const rootAndSubDirectory = (rootOrientation: number, subDirectoryFirst: boolean) => {
  const bytes = new Uint8Array(70);
  bytes.set(tiff(rootOrientation));
  bytes[8] = 2;
  const pointer = new Uint8Array(12);
  const view = new DataView(pointer.buffer);
  view.setUint16(0, 0x8769, true);
  view.setUint16(2, 4, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, 40, true);
  bytes.set(pointer, 22);
  if (subDirectoryFirst) {
    bytes.set(bytes.slice(10, 22), 22);
    bytes.set(pointer, 10);
  }
  bytes.set(tiff(6).slice(8), 40);
  return bytes;
};
const flipLastByte = (bytes: Uint8Array, fromEnd = 1) => {
  const copy = bytes.slice();
  copy[copy.length - fromEnd]! ^= 0xff;
  return copy;
};

const app = (marker: number, data: Uint8Array) => cat(new Uint8Array([255, marker, (data.length + 2) >> 8, (data.length + 2) & 255]), data);
const exifHeader = new Uint8Array([69, 120, 105, 102, 0, 0]);
const exif = (tiffBytes: Uint8Array) => app(0xe1, cat(exifHeader, tiffBytes));
const jpegSegmentEnd = (bytes: Uint8Array, markers: readonly number[]) => {
  for (let at = 2; at + 3 < bytes.length; ) {
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (markers.includes(bytes[at + 1]!)) return at + 2 + length;
    at += 2 + length;
  }
  throw new Error("frame header missing");
};
const pngChunk = (type: string, data: Uint8Array) => {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(ascii(type), 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of bytes.slice(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
};
const webpChunk = (type: string, data: Uint8Array) => {
  const bytes = new Uint8Array(8 + data.length + (data.length % 2));
  bytes.set(ascii(type));
  new DataView(bytes.buffer).setUint32(4, data.length, true);
  bytes.set(data, 8);
  return bytes;
};
const webp = (...chunks: Uint8Array[]) => {
  const bytes = cat(ascii("RIFF"), new Uint8Array(4), ascii("WEBP"), ...chunks);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  return bytes;
};
const bmp = (core: boolean, topDown = false) => {
  const width = 40;
  const height = 30;
  const header = core ? 12 : 40;
  const bytes = new Uint8Array(14 + header + width * height * 3);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("BM"));
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 14 + header, true);
  view.setUint32(14, header, true);
  if (core) {
    view.setUint16(18, width, true);
    view.setUint16(20, height, true);
    view.setUint16(22, 1, true);
    view.setUint16(24, 24, true);
  } else {
    view.setInt32(18, width, true);
    view.setInt32(22, topDown ? -height : height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
  }
  return bytes;
};
const losslessWebp = () => {
  const bits: number[] = [];
  const put = (value: number, count: number) => {
    for (let index = 0; index < count; index++) bits.push((value >> index) & 1);
  };
  put(0, 3);
  for (const symbol of [0, 0, 0, 255, 0]) {
    put(1, 1);
    put(0, 1);
    put(symbol > 1 ? 1 : 0, 1);
    put(symbol, symbol > 1 ? 8 : 1);
  }
  const stream = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => (stream[index >> 3]! |= bit << (index % 8)));
  const header = new Uint8Array(5);
  header[0] = 0x2f;
  new DataView(header.buffer).setUint32(1, 39 | (29 << 14), true);
  return webpChunk("VP8L", cat(header, stream));
};

const UPRIGHT: ImageSize = { width: 40, height: 30 };
const TURNED: ImageSize = { width: 30, height: 40 };

export function imageSizeFixtures(): ImageSizeFixture[] {
  const jpeg = decode64(JPEG_BASE64);
  const png = decode64(PNG_BASE64);
  const lossy = decode64(WEBP_BASE64);
  const progressive = decode64(PROGRESSIVE_JPEG_BASE64);
  const gif = decode64(GIF_BASE64);
  const afterFrame = jpegSegmentEnd(jpeg, [0xc0]);
  const afterProgressiveFrame = jpegSegmentEnd(progressive, [0xc2]);
  const big = app(0xe2, new Uint8Array(65500));
  const emptyDirectory = tiff(1);
  emptyDirectory[8] = 0;
  const exifChunk = pngChunk("eXIf", tiff(6));
  const fctl = new Uint8Array(26);
  const fctlView = new DataView(fctl.buffer);
  fctlView.setUint32(4, 40);
  fctlView.setUint32(8, 30);
  fctlView.setUint16(20, 1);
  fctlView.setUint16(22, 10);
  const actl = new Uint8Array(8);
  new DataView(actl.buffer).setUint32(0, 1);
  const vp8: Uint8Array[] = [];
  for (let at = 12; at + 8 <= lossy.length; ) {
    const length = new DataView(lossy.buffer).getUint32(at + 4, true);
    const chunk = lossy.slice(at, at + 8 + length + (length % 2));
    if (String.fromCharCode(...chunk.slice(0, 4)) === "VP8 ") vp8.push(chunk);
    at += chunk.length;
  }
  const vp8x = new Uint8Array([8, 0, 0, 0, 39, 0, 0, 29, 0, 0]);
  const lossless = losslessWebp();
  const gifFrame = (left: number, top: number) =>
    new Uint8Array([44, left, 0, top, 0, 2, 0, 2, 0, 0, 2, 4, 4, 65, 16, 5, 0, 59]);
  const wideGif = cat(gif.slice(0, 6), new Uint8Array([4, 0, 3, 0]), gif.slice(10, 19), gifFrame(0, 0));

  const fixture = (name: string, mime: string, bytes: Uint8Array, decoded: ImageSize | null, read: ImageSize | null = decoded) => ({
    name,
    mime,
    bytes,
    decoded,
    read,
  });
  const jpg = (name: string, bytes: Uint8Array, decoded: ImageSize | null, read?: ImageSize | null) =>
    fixture(name, "image/jpeg", bytes, decoded, read);
  const pngFixture = (name: string, bytes: Uint8Array, decoded: ImageSize | null, read?: ImageSize | null) =>
    fixture(name, "image/png", bytes, decoded, read);

  return [
    jpg("jpeg-basic", jpeg, UPRIGHT),
    jpg("jpeg-exif-before-frame", insert(jpeg, 2, exif(tiff(6))), TURNED),
    jpg("jpeg-exif-after-frame", insert(jpeg, afterFrame, exif(tiff(6))), TURNED),
    jpg("jpeg-xmp-before-exif", insert(jpeg, 2, cat(app(0xe1, ascii("http://ns.adobe.com/xap/1.0/")), exif(tiff(6)))), TURNED),
    jpg("jpeg-two-exif-1-6", insert(jpeg, 2, cat(exif(tiff(1)), exif(tiff(6)))), UPRIGHT),
    jpg("jpeg-two-exif-6-1", insert(jpeg, 2, cat(exif(tiff(6)), exif(tiff(1)))), TURNED),
    jpg("jpeg-no-orientation-then-exif", insert(jpeg, 2, cat(exif(tiff(0)), exif(tiff(6)))), UPRIGHT),
    jpg("jpeg-empty-exif-then-exif", insert(jpeg, 2, cat(exif(emptyDirectory), exif(tiff(6)))), UPRIGHT),
    jpg("jpeg-subifd-orientation", insert(jpeg, 2, exif(subDirectoryTiff())), TURNED),
    jpg("jpeg-root-1-sub-6", insert(jpeg, 2, exif(subDirectoryTiff(1))), UPRIGHT),
    jpg("jpeg-invalid-tag-type", insert(jpeg, 2, exif(tiff(6, 1))), UPRIGHT),
    jpg("jpeg-invalid-tag-count", insert(jpeg, 2, exif(tiff(6, 3, 0))), UPRIGHT),
    jpg("jpeg-exif-big-endian", insert(jpeg, 2, exif(bigEndianTiff(6))), TURNED),
    jpg("jpeg-orientation-8", insert(jpeg, 2, exif(tiff(8))), TURNED),
    jpg("jpeg-orientation-3", insert(jpeg, 2, exif(tiff(3))), UPRIGHT),
    jpg("jpeg-orientation-9", insert(jpeg, 2, exif(tiff(9))), UPRIGHT),
    jpg("jpeg-exif-past-limit-after-frame", insert(jpeg, afterFrame, cat(big, exif(tiff(6)))), TURNED, null),
    jpg("jpeg-exif-past-limit-before-frame", insert(jpeg, 2, cat(big, exif(tiff(6)))), TURNED, null),
    jpg("jpeg-garbage-before-frame", insert(jpeg, 2, new Uint8Array([18, 52, 86])), null),
    jpg("jpeg-garbage-after-frame-no-exif", insert(jpeg, afterFrame, new Uint8Array([18, 52, 86])), UPRIGHT),
    jpg("jpeg-garbage-after-frame-before-exif", insert(jpeg, afterFrame, cat(new Uint8Array([18, 52, 86]), exif(tiff(6)))), TURNED),
    jpg("jpeg-ff00-after-frame-before-exif", insert(jpeg, afterFrame, cat(new Uint8Array([255, 0, 18]), exif(tiff(6)))), TURNED),
    jpg("jpeg-exif-after-scan", insert(jpeg, jpeg.length - 2, exif(tiff(6))), UPRIGHT),
    jpg("jpeg-duplicate-orientation-1-6", insert(jpeg, 2, exif(twoOrientations(1, 6))), UPRIGHT),
    jpg("jpeg-duplicate-orientation-6-1", insert(jpeg, 2, exif(twoOrientations(6, 1))), TURNED),
    jpg("jpeg-duplicate-orientation-0-6", insert(jpeg, 2, exif(twoOrientations(0, 6))), TURNED),
    jpg("jpeg-root-1-sub-6-sub-first", insert(jpeg, 2, exif(rootAndSubDirectory(1, true))), TURNED),
    jpg("jpeg-root-0-sub-6", insert(jpeg, 2, exif(rootAndSubDirectory(0, false))), TURNED),
    jpg("jpeg-root-9-sub-6", insert(jpeg, 2, exif(rootAndSubDirectory(9, false))), TURNED),
    jpg("jpeg-raster-with-svg-text-unsettled", insert(jpeg, afterFrame, cat(app(0xe2, cat(ascii('<svg width="12" height="13">'), new Uint8Array(65470))), exif(tiff(6)))), TURNED, null),
    ...[0xc1, 0xc3, 0xc9].map((marker) => {
      const bytes = jpeg.slice();
      bytes[afterFrame - 19 + 1] = marker;
      return jpg(`jpeg-frame-${marker.toString(16)}`, bytes, UPRIGHT);
    }),
    ...[0xc5, 0xcd].map((marker) => {
      const bytes = jpeg.slice();
      bytes[afterFrame - 19 + 1] = marker;
      return jpg(`jpeg-frame-${marker.toString(16)}`, bytes, null);
    }),
    jpg("jpeg-progressive", progressive, UPRIGHT),
    jpg("jpeg-progressive-exif-after-frame", insert(progressive, afterProgressiveFrame, exif(tiff(6))), TURNED),
    jpg("jpeg-progressive-encoder-exif", decode64(PROGRESSIVE_TURNED_JPEG_BASE64), TURNED),
    pngFixture("png-basic", png, UPRIGHT),
    pngFixture("png-exif-before-idat", insert(png, 33, exifChunk), TURNED),
    pngFixture("png-exif-after-idat", insert(png, png.length - 12, exifChunk), UPRIGHT),
    pngFixture("png-exif-past-limit", insert(png, 33, cat(pngChunk("tEXt", cat(ascii("note"), new Uint8Array(65500))), exifChunk)), TURNED, null),
    pngFixture("png-text-past-limit-no-exif", insert(png, 33, pngChunk("tEXt", cat(ascii("note"), new Uint8Array(65500)))), UPRIGHT, null),
    pngFixture("png-invalid-tag-type", insert(png, 33, pngChunk("eXIf", tiff(6, 1))), UPRIGHT),
    pngFixture("png-two-exif-1-6", insert(png, 33, cat(pngChunk("eXIf", tiff(1)), exifChunk)), UPRIGHT),
    pngFixture("png-duplicate-orientation-1-6", insert(png, 33, pngChunk("eXIf", twoOrientations(1, 6))), UPRIGHT),
    pngFixture("png-duplicate-orientation-6-1", insert(png, 33, pngChunk("eXIf", twoOrientations(6, 1))), TURNED),
    pngFixture("png-root-1-sub-6-sub-first", insert(png, 33, pngChunk("eXIf", rootAndSubDirectory(1, true))), TURNED),
    pngFixture("png-root-0-sub-6", insert(png, 33, pngChunk("eXIf", rootAndSubDirectory(0, false))), TURNED),
    pngFixture("png-exif-bad-crc", insert(png, 33, flipLastByte(exifChunk)), UPRIGHT),
    pngFixture("png-exif-bad-crc-then-valid-exif", insert(png, 33, cat(flipLastByte(exifChunk), exifChunk)), TURNED),
    pngFixture("png-exif-bad-crc-then-upright-exif", insert(png, 33, cat(flipLastByte(exifChunk), pngChunk("eXIf", tiff(1)))), UPRIGHT),
    pngFixture("png-exif-crc-past-limit", insert(png, 33, cat(pngChunk("tEXt", cat(ascii("note"), new Uint8Array(65451))), flipLastByte(exifChunk))), UPRIGHT, null),
    pngFixture("png-raster-with-svg-text-unsettled", insert(png, 33, cat(pngChunk("tEXt", cat(ascii('source<svg width="12" height="13">'), new Uint8Array(65500))), exifChunk)), TURNED, null),
    pngFixture("apng-exif-before-idat", insert(png, 33, cat(pngChunk("acTL", actl), pngChunk("fcTL", fctl), exifChunk)), TURNED),
    fixture("webp-vp8", "image/webp", webp(...vp8), UPRIGHT),
    fixture("webp-vp8x-no-exif", "image/webp", lossy, UPRIGHT),
    fixture("webp-vp8x-exif-after", "image/webp", webp(webpChunk("VP8X", vp8x), ...vp8, webpChunk("EXIF", tiff(6))), UPRIGHT),
    fixture("webp-vp8x-exif-before", "image/webp", webp(webpChunk("VP8X", vp8x), webpChunk("EXIF", tiff(6)), ...vp8), UPRIGHT),
    fixture("webp-vp8x-exif-prefixed", "image/webp", webp(webpChunk("VP8X", vp8x), ...vp8, webpChunk("EXIF", cat(exifHeader, tiff(6)))), UPRIGHT),
    fixture("webp-vp8l", "image/webp", webp(lossless), UPRIGHT),
    fixture("webp-vp8l-exif", "image/webp", webp(webpChunk("VP8X", vp8x), lossless, webpChunk("EXIF", tiff(6))), UPRIGHT),
    fixture("bmp-info", "image/bmp", bmp(false), UPRIGHT),
    fixture("bmp-info-top-down", "image/bmp", bmp(false, true), UPRIGHT),
    fixture("bmp-core", "image/bmp", bmp(true), UPRIGHT),
    fixture("gif-basic", "image/gif", gif, { width: 1, height: 1 }),
    fixture("gif-frame-larger-than-screen", "image/gif", cat(gif.slice(0, 19), gifFrame(0, 0)), { width: 2, height: 2 }),
    fixture("gif-frame-offset-past-screen", "image/gif", cat(gif.slice(0, 19), gifFrame(1, 1)), { width: 3, height: 3 }),
    fixture("gif-frame-smaller-than-screen", "image/gif", wideGif, { width: 4, height: 3 }),
  ];
}
