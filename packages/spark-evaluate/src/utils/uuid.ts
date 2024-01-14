/*
 * uuid <https://github.com/lukeed/uuid>
 *
 * Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)
 * Released under the MIT License.
 */

let IDX = 256;
const HEX: string[] = [];
let BUFFER: number[];

while (IDX--) {
  HEX[IDX] = (IDX + 256).toString(16).substring(1);
}

const uuid = (): string => {
  var i = 0,
    num,
    out = "";

  if (!BUFFER || IDX + 16 > 256) {
    BUFFER = Array((i = 256));
    while (i--) BUFFER[i] = (256 * Math.random()) | 0;
    i = IDX = 0;
  }

  for (; i < 16; i++) {
    num = BUFFER[IDX + i] || 0;
    if (i == 6) out += HEX[(num & 15) | 64];
    else if (i == 8) out += HEX[(num & 63) | 128];
    else out += HEX[num];

    if (i & 1 && i > 1 && i < 11) out += "-";
  }

  IDX++;
  return out;
};

export default uuid;
