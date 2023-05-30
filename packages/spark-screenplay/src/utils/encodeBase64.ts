import { BASE64_CHARS } from "../constants/BASE64_CHARS";

export const encodeBase64 = (buf: ArrayBuffer | Uint8Array): string => {
  let bytes = new Uint8Array(buf);
  let i;
  let len = bytes.length;
  let base64 = "";

  for (i = 0; i < len; i += 3) {
    base64 += BASE64_CHARS[(bytes[i] || 0) >> 2];
    base64 +=
      BASE64_CHARS[(((bytes[i] || 0) & 3) << 4) | ((bytes[i + 1] || 0) >> 4)];
    base64 +=
      BASE64_CHARS[
        (((bytes[i + 1] || 0) & 15) << 2) | ((bytes[i + 2] || 0) >> 6)
      ];
    base64 += BASE64_CHARS[(bytes[i + 2] || 0) & 63];
  }

  if (len % 3 === 2) {
    base64 = base64.substring(0, base64.length - 1) + "=";
  } else if (len % 3 === 1) {
    base64 = base64.substring(0, base64.length - 2) + "==";
  }

  return base64;
};
