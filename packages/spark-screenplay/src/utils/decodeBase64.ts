import { BASE64_LOOKUP } from "../constants/BASE64_LOOKUP";

export const decodeBase64 = (
  str: string,
  separator = ";base64,"
): Uint8Array => {
  const splitStr = separator ? str.split(separator) : undefined;
  const base64 = splitStr?.[1] || str;
  let bufferLength = base64.length * 0.75,
    len = base64.length,
    i,
    p = 0,
    encoded1,
    encoded2,
    encoded3,
    encoded4;

  if (base64[base64.length - 1] === "=") {
    bufferLength--;
    if (base64[base64.length - 2] === "=") {
      bufferLength--;
    }
  }

  const arraybuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arraybuffer);

  for (i = 0; i < len; i += 4) {
    encoded1 = BASE64_LOOKUP[base64.charCodeAt(i)] || 0;
    encoded2 = BASE64_LOOKUP[base64.charCodeAt(i + 1)] || 0;
    encoded3 = BASE64_LOOKUP[base64.charCodeAt(i + 2)] || 0;
    encoded4 = BASE64_LOOKUP[base64.charCodeAt(i + 3)] || 0;

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }

  return bytes;
};
