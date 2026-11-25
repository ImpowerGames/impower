import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "project", "assets");

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const write = (relative, data) => {
  const file = join(assets, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  return file;
};

const fmt = (n) => {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  const t = s.endsWith(".0") ? s.slice(0, -2) : s;
  return t === "-0" ? "0" : t;
};

const identity = (x, y) => [x, y];

const pathD = (cmds, t = identity) =>
  cmds
    .map(([c, ...v]) => {
      const out = [];
      for (let i = 0; i < v.length; i += 2) {
        const [x, y] = t(v[i], v[i + 1]);
        out.push(fmt(x), fmt(y));
      }
      return c + out.join(" ");
    })
    .join("");

const place = (ox, oy, angle = 0, scale = 1) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (x, y) => [ox + scale * (x * c - y * s), oy + scale * (x * s + y * c)];
};

const ellipseCmds = (cx, cy, rx, ry) => {
  const k = 0.5523;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry],
    ["C", cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy],
    ["C", cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry],
    ["C", cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy],
    ["Z"],
  ];
};

const strandCmds = (x0, y0, x1, y1, bend, width) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const c1x = x0 + dx * 0.33 + nx * bend;
  const c1y = y0 + dy * 0.33 + ny * bend;
  const c2x = x0 + dx * 0.66 + nx * bend;
  const c2y = y0 + dy * 0.66 + ny * bend;
  const h = width / 2;
  return [
    ["M", x0 + nx * h, y0 + ny * h],
    ["C", c1x + nx * h * 0.7, c1y + ny * h * 0.7, c2x + nx * h * 0.3, c2y + ny * h * 0.3, x1, y1],
    ["C", c2x - nx * h * 0.3, c2y - ny * h * 0.3, c1x - nx * h * 0.7, c1y - ny * h * 0.7, x0 - nx * h, y0 - ny * h],
    ["Z"],
  ];
};

const leafCmds = (length, width) => [
  ["M", 0, 0],
  ["C", length * 0.3, -width, length * 0.75, -width, length, 0],
  ["C", length * 0.75, width, length * 0.3, width, 0, 0],
  ["Z"],
];

const starCmds = (cx, cy, outer, inner, points, turn = 0) => {
  const cmds = [];
  for (let i = 0; i < points; i++) {
    const a0 = turn + (i / points) * Math.PI * 2 - Math.PI / 2;
    const a1 = a0 + Math.PI / points;
    const a2 = a0 + (2 * Math.PI) / points;
    const ox = cx + Math.cos(a0) * outer;
    const oy = cy + Math.sin(a0) * outer;
    if (i === 0) cmds.push(["M", ox, oy]);
    cmds.push([
      "Q",
      cx + Math.cos(a1) * inner,
      cy + Math.sin(a1) * inner,
      cx + Math.cos(a2) * outer,
      cy + Math.sin(a2) * outer,
    ]);
  }
  cmds.push(["Z"]);
  return cmds;
};

const path = (cmds, fill, t = identity, extra = "") => `<path d="${pathD(cmds, t)}" fill="${fill}"${extra}/>`;
const group = (name, children) => `<g data-name="${name}">${children.join("")}</g>`;
const mirror = (x, y) => [1600 - x, y];

const portraitSvg = () => {
  const rand = mulberry32(2809);
  const skin = "#e9b896";
  const skinShade = "#cf9473";
  const hairDark = "#23285e";
  const hairMid = "#33408a";
  const hairLight = "#4d5fb8";
  const coat = "#1d6b66";
  const coatDark = "#134a47";

  const hairBack = [
    path(
      [
        ["M", 800, 165],
        ["C", 1070, 165, 1140, 390, 1118, 640],
        ["C", 1105, 790, 1040, 860, 975, 880],
        ["L", 625, 880],
        ["C", 560, 860, 495, 790, 482, 640],
        ["C", 460, 390, 530, 165, 800, 165],
        ["Z"],
      ],
      hairDark,
    ),
  ];
  for (let i = 0; i < 44; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const k = Math.floor(i / 2) / 22;
    const x0 = 800 + side * (120 + k * 170);
    const y0 = 230 + k * 120;
    const x1 = 800 + side * (230 + k * 120 + rand() * 40);
    const y1 = 640 + k * 230 + rand() * 40;
    hairBack.push(path(strandCmds(x0, y0, x1, y1, side * (30 + rand() * 40), 26 + rand() * 18), i % 3 === 0 ? hairLight : hairMid));
  }

  const body = [
    path(
      [
        ["M", 410, 1200],
        ["C", 420, 960, 555, 860, 735, 818],
        ["C", 775, 852, 825, 852, 865, 818],
        ["C", 1045, 860, 1180, 960, 1190, 1200],
        ["Z"],
      ],
      coat,
    ),
  ];
  const lapel = [
    ["M", 735, 822],
    ["C", 700, 900, 680, 980, 690, 1060],
    ["C", 730, 990, 770, 930, 800, 900],
    ["C", 780, 880, 755, 850, 735, 822],
    ["Z"],
  ];
  body.push(path(lapel, coatDark), path(lapel, coatDark, mirror));
  body.push(
    path(
      [
        ["M", 728, 812],
        ["C", 760, 860, 840, 860, 872, 812],
        ["C", 860, 800, 845, 795, 830, 800],
        ["C", 815, 830, 785, 830, 770, 800],
        ["C", 755, 795, 740, 800, 728, 812],
        ["Z"],
      ],
      "#f4ead8",
    ),
  );
  let leaves = 0;
  let guard = 0;
  while (leaves < 64 && guard < 5000) {
    guard++;
    const y = 910 + rand() * 270;
    const x = 800 + (rand() * 2 - 1) * (215 + (y - 910) * 0.55);
    if (Math.abs(x - 800) < 40) continue;
    const t = place(x, y, rand() * Math.PI * 2, 0.8 + rand() * 0.6);
    body.push(path(leafCmds(34, 11), leaves % 4 === 0 ? "#f2c14e" : leaves % 4 === 1 ? "#e07a5f" : leaves % 4 === 2 ? "#81b29a" : "#f4f1de", t));
    leaves++;
  }
  for (let i = 0; i < 4; i++) {
    const y = 940 + i * 60;
    body.push(path(ellipseCmds(800, y, 13, 13), "#e9c46a"));
    body.push(path(strandCmds(791, y, 809, y, 3, 4), coatDark));
  }

  const neck = [
    path(
      [
        ["M", 738, 680],
        ["L", 738, 805],
        ["C", 760, 838, 840, 838, 862, 805],
        ["L", 862, 680],
        ["Z"],
      ],
      skinShade,
    ),
  ];

  const head = [];
  const ear = [
    ["M", 606, 425],
    ["C", 556, 400, 538, 470, 556, 515],
    ["C", 568, 546, 596, 552, 614, 535],
    ["Z"],
  ];
  const earInner = [
    ["M", 600, 448],
    ["C", 572, 440, 566, 482, 578, 506],
    ["C", 586, 518, 598, 518, 604, 510],
    ["C", 590, 495, 588, 470, 600, 448],
    ["Z"],
  ];
  head.push(path(ear, skin), path(earInner, skinShade), path(ear, skin, mirror), path(earInner, skinShade, mirror));
  head.push(
    path(
      [
        ["M", 800, 228],
        ["C", 922, 228, 1002, 330, 1002, 470],
        ["C", 1002, 602, 902, 722, 800, 722],
        ["C", 698, 722, 598, 602, 598, 470],
        ["C", 598, 330, 678, 228, 800, 228],
        ["Z"],
      ],
      skin,
    ),
  );
  head.push(path(ellipseCmds(690, 575, 46, 26), "#ef8f86", identity, ` opacity="0.45"`));
  head.push(path(ellipseCmds(910, 575, 46, 26), "#ef8f86", identity, ` opacity="0.45"`));
  for (let i = 0; i < 24; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = 800 + side * (85 + rand() * 70);
    const y = 540 + rand() * 60;
    head.push(path(ellipseCmds(x, y, 3 + rand() * 2.5, 2.5 + rand() * 2), "#b5715a", identity, ` opacity="0.6"`));
  }
  head.push(
    path(
      [
        ["M", 806, 470],
        ["C", 815, 515, 832, 545, 822, 560],
        ["C", 812, 570, 795, 568, 786, 562],
        ["C", 800, 560, 812, 556, 814, 548],
        ["C", 816, 530, 805, 500, 806, 470],
        ["Z"],
      ],
      skinShade,
    ),
    path(ellipseCmds(784, 566, 7, 4), "#a8644d"),
    path(ellipseCmds(818, 566, 7, 4), "#a8644d"),
  );
  const brow = strandCmds(668, 418, 762, 404, -10, 16);
  head.push(group("brows", [path(brow, hairDark), path(brow, hairDark, mirror)]));

  const eyeOpen = (cx, cy, t) => {
    const parts = [];
    parts.push(
      path(
        [
          ["M", cx - 52, cy],
          ["C", cx - 32, cy - 34, cx + 32, cy - 34, cx + 52, cy],
          ["C", cx + 32, cy + 27, cx - 32, cy + 27, cx - 52, cy],
          ["Z"],
        ],
        "#fbf7f2",
        t,
      ),
    );
    parts.push(path(ellipseCmds(cx, cy, 23, 23), "#3a7ca5", t));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(path(strandCmds(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, cx + Math.cos(a) * 21, cy + Math.sin(a) * 21, 2, 5), "#5fa8d3", t));
    }
    parts.push(path(ellipseCmds(cx, cy, 10, 10), "#14213d", t));
    parts.push(path(ellipseCmds(cx + 8, cy - 8, 5, 5), "#ffffff", t));
    parts.push(path(ellipseCmds(cx - 6, cy + 7, 2.5, 2.5), "#ffffff", t));
    parts.push(
      path(
        [
          ["M", cx - 58, cy + 2],
          ["C", cx - 30, cy - 42, cx + 30, cy - 42, cx + 60, cy - 4],
          ["C", cx + 30, cy - 31, cx - 30, cy - 31, cx - 58, cy + 2],
          ["Z"],
        ],
        "#1b1b2f",
        t,
      ),
    );
    parts.push(path(strandCmds(cx - 40, cy + 14, cx + 44, cy + 8, 14, 4), "#6b4a3a", t));
    for (let i = 0; i < 3; i++) {
      parts.push(path(strandCmds(cx + 42 + i * 4, cy - 12 + i * 5, cx + 70 + i * 5, cy - 26 + i * 8, -4, 5), "#1b1b2f", t));
    }
    return parts;
  };
  const eyeClosed = (cx, cy, t) => {
    const parts = [];
    parts.push(
      path(
        [
          ["M", cx - 52, cy - 6],
          ["C", cx - 30, cy - 22, cx + 30, cy - 22, cx + 52, cy - 6],
          ["C", cx + 30, cy + 16, cx - 30, cy + 16, cx - 52, cy - 6],
          ["Z"],
        ],
        skinShade,
        t,
      ),
    );
    parts.push(
      path(
        [
          ["M", cx - 56, cy],
          ["C", cx - 30, cy + 24, cx + 30, cy + 24, cx + 58, cy - 2],
          ["C", cx + 30, cy + 14, cx - 30, cy + 14, cx - 56, cy],
          ["Z"],
        ],
        "#1b1b2f",
        t,
      ),
    );
    for (let i = 0; i < 3; i++) {
      parts.push(path(strandCmds(cx + 30 - i * 26, cy + 14, cx + 36 - i * 30, cy + 34, 3, 5), "#1b1b2f", t));
    }
    return parts;
  };
  head.push(
    group("eyes.open default", [
      group("eye-open-left", eyeOpen(715, 480, identity)),
      group("eye-open-right", eyeOpen(715, 480, mirror)),
    ]),
    group("eyes.closed", [
      group("eye-shut-left", eyeClosed(715, 480, identity)),
      group("eye-shut-right", eyeClosed(715, 480, mirror)),
    ]),
  );
  head.push(
    group("lips-closed mouth.closed default", [
      path(
        [
          ["M", 748, 612],
          ["C", 778, 626, 822, 626, 852, 612],
          ["C", 822, 619, 778, 619, 748, 612],
          ["Z"],
        ],
        "#8c3b3b",
      ),
      path(
        [
          ["M", 770, 630],
          ["C", 790, 642, 810, 642, 830, 630],
          ["C", 810, 636, 790, 636, 770, 630],
          ["Z"],
        ],
        "#c76d5e",
      ),
      path(ellipseCmds(744, 610, 4, 3), "#b5715a"),
      path(ellipseCmds(856, 610, 4, 3), "#b5715a"),
    ]),
    group("lips-teeth mouth.teeth", [
      path(
        [
          ["M", 752, 604],
          ["C", 778, 640, 822, 640, 848, 604],
          ["C", 822, 612, 778, 612, 752, 604],
          ["Z"],
        ],
        "#5a1f2b",
      ),
      path(
        [
          ["M", 760, 608],
          ["C", 780, 622, 820, 622, 840, 608],
          ["C", 820, 613, 780, 613, 760, 608],
          ["Z"],
        ],
        "#fdfbf5",
      ),
      path(strandCmds(752, 604, 848, 604, -6, 6), "#8c3b3b"),
      path(
        [
          ["M", 772, 638],
          ["C", 790, 648, 810, 648, 828, 638],
          ["C", 810, 642, 790, 642, 772, 638],
          ["Z"],
        ],
        "#c76d5e",
      ),
    ]),
    group("lips-open mouth.open", [
      path(
        [
          ["M", 758, 598],
          ["C", 766, 668, 834, 668, 842, 598],
          ["C", 820, 608, 780, 608, 758, 598],
          ["Z"],
        ],
        "#4a1622",
      ),
      path(
        [
          ["M", 776, 650],
          ["C", 788, 630, 812, 630, 824, 650],
          ["C", 812, 660, 788, 660, 776, 650],
          ["Z"],
        ],
        "#d9626b",
      ),
      path(
        [
          ["M", 766, 604],
          ["C", 782, 616, 818, 616, 834, 604],
          ["C", 818, 608, 782, 608, 766, 604],
          ["Z"],
        ],
        "#fdfbf5",
      ),
      path(strandCmds(756, 598, 844, 598, -7, 6), "#8c3b3b"),
      path(
        [
          ["M", 774, 662],
          ["C", 790, 674, 810, 674, 826, 662],
          ["C", 810, 668, 790, 668, 774, 662],
          ["Z"],
        ],
        "#c76d5e",
      ),
    ]),
  );

  const hairFront = [
    path(
      [
        ["M", 596, 430],
        ["C", 586, 262, 690, 176, 800, 176],
        ["C", 910, 176, 1014, 262, 1004, 430],
        ["C", 944, 334, 862, 300, 800, 300],
        ["C", 738, 300, 656, 334, 596, 430],
        ["Z"],
      ],
      hairMid,
    ),
  ];
  for (let i = 0; i < 48; i++) {
    const u = i / 47;
    const x0 = 650 + u * 300 + (rand() - 0.5) * 20;
    const y0 = 190 + Math.abs(u - 0.5) * 70 + rand() * 20;
    const x1 = 600 + u * 400 + (rand() - 0.5) * 60;
    const y1 = 330 + Math.sin(u * Math.PI) * 50 + rand() * 50;
    hairFront.push(path(strandCmds(x0, y0, x1, y1, (u - 0.5) * 60 + (rand() - 0.5) * 30, 18 + rand() * 16), i % 4 === 0 ? hairLight : i % 4 === 1 ? hairDark : hairMid));
  }

  const accessories = [];
  accessories.push(path(starCmds(948, 262, 34, 13, 5, 0.2), "#f2c14e"));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    accessories.push(path(starCmds(948 + Math.cos(a) * 52, 262 + Math.sin(a) * 52, 9, 3, 4, a), "#fff3b0"));
  }
  const earring = [
    ["M", 586, 545],
    ["C", 600, 560, 604, 590, 586, 606],
    ["C", 568, 590, 572, 560, 586, 545],
    ["Z"],
  ];
  accessories.push(path(earring, "#f2c14e"), path(ellipseCmds(586, 580, 6, 9), "#e07a5f"));
  accessories.push(path(earring, "#f2c14e", mirror), path(ellipseCmds(586, 580, 6, 9), "#e07a5f", mirror));

  const layers = [
    group("hair-back", hairBack),
    group("body", body),
    group("neck", neck),
    group("head", head),
    group("hair-front", hairFront),
    group("accessories", accessories),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">${layers.join("")}</svg>\n`;
};

const duskSvg = () => {
  const rand = mulberry32(908);
  const parts = [];
  parts.push(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f4b"/><stop offset="0.55" stop-color="#7b3f73"/><stop offset="1" stop-color="#f29e6d"/></linearGradient></defs>`,
  );
  parts.push(`<rect width="1600" height="900" fill="url(#sky)"/>`);
  for (let i = 0; i < 36; i++) {
    parts.push(path(starCmds(rand() * 1600, rand() * 380, 4 + rand() * 4, 1.2, 4, rand()), "#fff7d6", identity, ` opacity="${fmt(0.5 + rand() * 0.5)}"`));
  }
  parts.push(path(ellipseCmds(1180, 520, 90, 90), "#ffd28a"));
  parts.push(path(ellipseCmds(1180, 520, 130, 130), "#ffd28a", identity, ` opacity="0.25"`));
  const ridgeColors = ["#5c3b6e", "#4a2f5e", "#3a254d", "#2a1a3c", "#1b112b"];
  ridgeColors.forEach((color, r) => {
    const base = 520 + r * 80;
    const cmds = [["M", 0, 900], ["L", 0, base]];
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const x0 = (i / steps) * 1600;
      const x1 = ((i + 1) / steps) * 1600;
      const peak = base - 60 - rand() * 90;
      cmds.push(["C", x0 + (x1 - x0) * 0.3, peak, x0 + (x1 - x0) * 0.7, peak, x1, base - rand() * 30]);
    }
    cmds.push(["L", 1600, 900], ["Z"]);
    parts.push(path(cmds, color));
  });
  for (let i = 0; i < 5; i++) {
    const cx = 150 + i * 320 + rand() * 60;
    const cy = 150 + rand() * 160;
    parts.push(path(ellipseCmds(cx, cy, 110 + rand() * 60, 18 + rand() * 10), "#f6c6a8", identity, ` opacity="0.35"`));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${parts.join("")}</svg>\n`;
};

const emblemSvg = () => {
  const parts = [];
  parts.push(path(ellipseCmds(256, 256, 240, 240), "#7a5230"));
  parts.push(path(ellipseCmds(256, 256, 220, 220), "#c9973f"));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    parts.push(path(leafCmds(70, 14), i % 2 ? "#f2d27a" : "#a8742f", place(256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120, a)));
  }
  parts.push(path(starCmds(256, 256, 110, 48, 8), "#7a5230"));
  parts.push(path(starCmds(256, 256, 80, 34, 8, Math.PI / 8), "#f2d27a"));
  parts.push(path(ellipseCmds(256, 256, 30, 30), "#5a3a1e"));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(path(ellipseCmds(256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200, 8, 8), "#fff1c1"));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${parts.join("")}</svg>\n`;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

const encodePng = (width, height, rgba) => {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 1;
    for (let x = 0; x < stride; x++) {
      const v = rgba[y * stride + x];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      raw[row + 1 + x] = (v - left) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const canvas = (width, height) => {
  const data = new Uint8Array(width * height * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  };
  const rect = (x0, y0, x1, y1, color, a = 255) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) set(x, y, color, a);
    }
  };
  const disc = (cx, cy, r, color, a = 255) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, color, a);
      }
    }
  };
  return { width, height, data, set, rect, disc };
};

const WIDE_W = 2400;
const WIDE_H = 900;

const hallLayers = () => {
  const rand = mulberry32(2656);
  const sky = canvas(WIDE_W, WIDE_H);
  const top = hex("#141938");
  const midSky = hex("#3d2c5e");
  const low = hex("#8a4f6b");
  for (let y = 0; y < WIDE_H; y++) {
    const t = y / (WIDE_H - 1);
    const band = Math.floor(t * 24) / 24;
    const color = band < 0.6 ? mix(top, midSky, band / 0.6) : mix(midSky, low, (band - 0.6) / 0.4);
    sky.rect(0, y, WIDE_W, y + 1, color);
  }
  const towers = canvas(WIDE_W, WIDE_H);
  const stone = hex("#2b2340");
  const stoneLight = hex("#3b3157");
  const glow = hex("#ffcf70");
  let x = 20;
  while (x < WIDE_W - 60) {
    const w = 90 + Math.floor(rand() * 110);
    const h = 280 + Math.floor(rand() * 360);
    const top0 = WIDE_H - h;
    const color = rand() < 0.5 ? stone : stoneLight;
    towers.rect(x, top0, x + w, WIDE_H, color);
    towers.disc(x + w / 2, top0, w / 2, color);
    for (let wy = top0 + 30; wy < WIDE_H - 40; wy += 46) {
      for (let wx = x + 14; wx < x + w - 24; wx += 34) {
        if (rand() < 0.55) towers.rect(wx, wy, wx + 12, wy + 20, glow);
      }
    }
    x += w + 16 + Math.floor(rand() * 40);
  }
  const lanterns = canvas(WIDE_W, WIDE_H);
  const warm = hex("#ffb347");
  const core = hex("#fff1c1");
  for (let i = 0; i < 26; i++) {
    const cx = 60 + rand() * (WIDE_W - 120);
    const cy = 80 + rand() * 380;
    const r = 14 + rand() * 12;
    lanterns.disc(cx, cy, r * 2.2, warm, 70);
    lanterns.disc(cx, cy, r, warm);
    lanterns.disc(cx, cy, r * 0.45, core);
    lanterns.rect(cx - 1, cy - r - 60, cx + 1, cy - r, hex("#1a1426"));
  }
  return [
    ["hall/90 sky.png", sky],
    ["hall/50 towers.png", towers],
    ["hall/10 lanterns.png", lanterns],
  ];
};

const vistaLayers = () => {
  const rand = mulberry32(2629);
  const sea = canvas(WIDE_W, WIDE_H);
  const skyTop = hex("#f6b48f");
  const skyLow = hex("#fbe0c4");
  const seaTop = hex("#4f7ca8");
  const seaLow = hex("#1d3557");
  const horizon = 470;
  for (let y = 0; y < WIDE_H; y++) {
    let color;
    if (y < horizon) color = mix(skyTop, skyLow, Math.floor((y / horizon) * 16) / 16);
    else color = mix(seaTop, seaLow, Math.floor(((y - horizon) / (WIDE_H - horizon)) * 12) / 12);
    sea.rect(0, y, WIDE_W, y + 1, color);
  }
  for (let i = 0; i < 40; i++) {
    const y = horizon + 20 + Math.floor(rand() * (WIDE_H - horizon - 40));
    const x0 = Math.floor(rand() * WIDE_W);
    sea.rect(x0, y, x0 + 80 + rand() * 200, y + 3, hex("#a8c5e0"));
  }
  const isles = canvas(WIDE_W, WIDE_H);
  const isleColors = [hex("#5b6d5b"), hex("#3f4f45"), hex("#2c3a33")];
  for (let k = 0; k < 7; k++) {
    const cx = 150 + k * 340 + rand() * 80;
    const half = 120 + rand() * 160;
    const height = 70 + rand() * 120;
    const color = isleColors[k % 3];
    for (let px = Math.floor(cx - half); px < cx + half; px++) {
      const u = (px - cx) / half;
      const top0 = horizon + 10 - height * Math.cos((u * Math.PI) / 2) ** 2;
      isles.rect(px, top0, px + 1, horizon + 14, color);
    }
  }
  const sails = canvas(WIDE_W, WIDE_H);
  const cloth = hex("#fdf6e3");
  const hull = hex("#6b3f2a");
  for (let i = 0; i < 9; i++) {
    const bx = 120 + i * 250 + rand() * 80;
    const by = 560 + rand() * 260;
    const s = 0.6 + rand() * 0.8;
    for (let row = 0; row < 70 * s; row++) {
      const w = (row / (70 * s)) * 44 * s;
      sails.rect(bx, by - 70 * s + row, bx + w, by - 70 * s + row + 1, cloth);
    }
    sails.rect(bx - 30 * s, by, bx + 54 * s, by + 12 * s, hull);
  }
  return [
    ["vista/90 sea.png", sea],
    ["vista/50 isles.png", isles],
    ["vista/10 sails.png", sails],
  ];
};

const RATE = 48000;

const musicPcm = () => {
  const seconds = 28;
  const n = seconds * RATE;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const beat = 60 / 96;
  const bar = beat * 4;
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [60, 64, 67],
    [55, 59, 62],
  ];
  const freq = (m) => 440 * 2 ** ((m - 69) / 12);
  const addNote = (start, length, f, gain, pan, kind) => {
    const s0 = Math.floor(start * RATE);
    const len = Math.floor(length * RATE);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / RATE;
      let v;
      if (kind === "pluck") {
        const env = Math.exp(-t / 0.28) * Math.min(1, t / 0.004);
        v = env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t) + 0.15 * Math.sin(6 * Math.PI * f * t));
      } else if (kind === "pad") {
        const env = Math.min(1, t / 0.6) * Math.min(1, (length - t) / 0.6);
        v = env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.003 * t));
      } else {
        const env = Math.exp(-t / 0.5) * Math.min(1, t / 0.01);
        v = env * (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(6 * Math.PI * f * t));
      }
      left[s0 + i] += v * gain * (1 - pan);
      right[s0 + i] += v * gain * (1 + pan);
    }
  };
  const bars = Math.ceil(seconds / bar);
  for (let b = 0; b < bars; b++) {
    const chord = chords[b % chords.length];
    const t0 = b * bar;
    for (const m of chord) addNote(t0, bar, freq(m), 0.06, 0, "pad");
    addNote(t0, beat * 2, freq(chord[0] - 24), 0.28, 0, "bass");
    addNote(t0 + beat * 2, beat * 2, freq(chord[0] - 24), 0.22, 0, "bass");
    const pattern = [0, 1, 2, 3, 2, 1, 0, 2];
    for (let k = 0; k < 8; k++) {
      const idx = pattern[k];
      const m = idx === 3 ? chord[0] + 12 : chord[idx] + 12;
      addNote(t0 + (k * beat) / 2, beat * 1.5, freq(m), 0.14, k % 2 ? 0.35 : -0.35, "pluck");
    }
  }
  return fadeAndNormalize([left, right], 0.5, 1.5);
};

const chimePcm = () => {
  const n = Math.floor(1.6 * RATE);
  const out = new Float32Array(n);
  const strike = (start, f, gain) => {
    const ratios = [1, 2.76, 5.4, 8.93];
    const decays = [0.9, 0.5, 0.25, 0.12];
    const s0 = Math.floor(start * RATE);
    for (let i = 0; s0 + i < n; i++) {
      const t = i / RATE;
      let v = 0;
      ratios.forEach((r, k) => {
        v += Math.exp(-t / decays[k]) * Math.sin(2 * Math.PI * f * r * t) / (k + 1);
      });
      out[s0 + i] += v * gain * Math.min(1, t / 0.002);
    }
  };
  strike(0, 880, 0.5);
  strike(0.14, 1318.5, 0.35);
  return fadeAndNormalize([out], 0, 0.2);
};

const whooshPcm = () => {
  const rand = mulberry32(2815);
  const seconds = 1.2;
  const n = Math.floor(seconds * RATE);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const cutoff = 200 + 3800 * Math.sin(Math.PI * t) ** 2;
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
    y += a * (rand() * 2 - 1 - y);
    out[i] = y * Math.sin(Math.PI * t) ** 2;
  }
  return fadeAndNormalize([out], 0.01, 0.05);
};

function fadeAndNormalize(channels, fadeIn, fadeOut) {
  const n = channels[0].length;
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const end = (n - i) / RATE;
      let g = 1;
      if (fadeIn > 0 && t < fadeIn) g *= t / fadeIn;
      if (fadeOut > 0 && end < fadeOut) g *= end / fadeOut;
      ch[i] *= g;
      peak = Math.max(peak, Math.abs(ch[i]));
    }
  }
  const scale = peak > 0 ? 0.8 / peak : 1;
  return channels.map((ch) => {
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(ch[i] * scale * 32767)));
    return pcm;
  });
}

const oggCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

const oggCrc = (bytes) => {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ oggCrcTable[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  return crc >>> 0;
};

const oggPage = ({ flags, granule, serial, sequence, packets }) => {
  const lacing = [];
  for (const p of packets) {
    let left = p.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  if (lacing.length > 255) throw new Error("ogg page holds too many segments");
  const body = Buffer.concat(packets);
  const page = Buffer.alloc(27 + lacing.length + body.length);
  page.write("OggS", 0, "ascii");
  page[4] = 0;
  page[5] = flags;
  page.writeBigInt64LE(BigInt(granule), 6);
  page.writeUInt32LE(serial, 14);
  page.writeUInt32LE(sequence, 18);
  page.writeUInt32LE(0, 22);
  page[26] = lacing.length;
  Buffer.from(lacing).copy(page, 27);
  body.copy(page, 27 + lacing.length);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
};

const muxOggOpus = ({ packets, channels, preSkip, samples, serial }) => {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head[8] = 1;
  head[9] = channels;
  head.writeUInt16LE(preSkip, 10);
  head.writeUInt32LE(RATE, 12);
  head.writeInt16LE(0, 16);
  head[18] = 0;
  const vendor = Buffer.from("impower pacing fixture generate.mjs", "ascii");
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write("OpusTags", 0, "ascii");
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);
  const pages = [];
  let sequence = 0;
  pages.push(oggPage({ flags: 2, granule: 0, serial, sequence: sequence++, packets: [head] }));
  pages.push(oggPage({ flags: 0, granule: 0, serial, sequence: sequence++, packets: [tags] }));
  const finalGranule = preSkip + samples;
  let granule = 0;
  let pending = [];
  let segments = 0;
  const flush = (last) => {
    pages.push(
      oggPage({
        flags: last ? 4 : 0,
        granule: last ? finalGranule : granule,
        serial,
        sequence: sequence++,
        packets: pending,
      }),
    );
    pending = [];
    segments = 0;
  };
  packets.forEach((p, i) => {
    const need = Math.floor(p.data.length / 255) + 1;
    if (pending.length > 0 && (segments + need > 255 || pending.length >= 50)) flush(false);
    pending.push(p.data);
    segments += need;
    granule += p.samples;
    if (i === packets.length - 1) flush(true);
  });
  if (granule < finalGranule) throw new Error(`encoded ${granule} samples, fewer than ${finalGranule}`);
  return Buffer.concat(pages);
};

const SOUNDS = [
  { file: "theme.ogg", make: musicPcm, bitrate: 40000, serial: 0x49505331 },
  { file: "chime.ogg", make: chimePcm, bitrate: 32000, serial: 0x49505332 },
  { file: "whoosh.ogg", make: whooshPcm, bitrate: 32000, serial: 0x49505333 },
];

const encodeInPage = async (page, pcm, bitrate) => {
  const channels = pcm.length;
  const frames = pcm[0].length;
  const padded = frames + 2 * 960;
  const interleaved = new Int16Array(padded * channels);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) interleaved[i * channels + c] = pcm[c][i];
  const b64 = Buffer.from(interleaved.buffer).toString("base64");
  return page.evaluate(
    async ({ b64, channels, padded, bitrate, rate }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer);
      const packets = [];
      let description = null;
      let failure = null;
      const encoder = new AudioEncoder({
        output: (chunk, meta) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          let s = "";
          for (const b of data) s += String.fromCharCode(b);
          packets.push({ data: btoa(s), duration: chunk.duration, timestamp: chunk.timestamp });
          if (!description && meta && meta.decoderConfig && meta.decoderConfig.description) {
            const d = new Uint8Array(meta.decoderConfig.description);
            description = Array.from(d);
          }
        },
        error: (e) => {
          failure = String(e);
        },
      });
      encoder.configure({
        codec: "opus",
        sampleRate: rate,
        numberOfChannels: channels,
        bitrate,
        opus: { frameDuration: 20000, complexity: 10, application: "audio" },
      });
      const block = 4800;
      for (let start = 0; start < padded; start += block) {
        const count = Math.min(block, padded - start);
        const planar = new Float32Array(count * channels);
        for (let c = 0; c < channels; c++) {
          for (let i = 0; i < count; i++) planar[c * count + i] = pcm[(start + i) * channels + c] / 32768;
        }
        const data = new AudioData({
          format: "f32-planar",
          sampleRate: rate,
          numberOfFrames: count,
          numberOfChannels: channels,
          timestamp: Math.round((start / rate) * 1e6),
          data: planar,
        });
        encoder.encode(data);
        data.close();
      }
      await encoder.flush();
      encoder.close();
      return { packets, description, failure };
    },
    { b64, channels, padded, bitrate, rate: RATE },
  );
};

const decodeInPage = (page, bytes) =>
  page.evaluate(
    async ({ b64 }) => {
      const bin = atob(b64);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      const context = new OfflineAudioContext(1, 1, 48000);
      const buffer = await context.decodeAudioData(data.buffer);
      let sum = 0;
      let peak = 0;
      let count = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const ch = buffer.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          sum += ch[i] * ch[i];
          peak = Math.max(peak, Math.abs(ch[i]));
          count++;
        }
      }
      return { duration: buffer.duration, channels: buffer.numberOfChannels, rate: buffer.sampleRate, rms: Math.sqrt(sum / count), peak };
    },
    { b64: Buffer.from(bytes).toString("base64") },
  );

const encodeSounds = async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const results = [];
  try {
    const page = await browser.newPage();
    await page.route("https://pacing-fixture.invalid/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>encoder</title>" }),
    );
    await page.goto("https://pacing-fixture.invalid/");
    const supported = await page.evaluate(async (rate) => {
      if (typeof AudioEncoder === "undefined") return false;
      const s = await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: rate, numberOfChannels: 2, bitrate: 40000 });
      return s.supported === true;
    }, RATE);
    if (!supported) throw new Error("this Chromium has no WebCodecs Opus encoder; no sound files were written");
    for (const sound of SOUNDS) {
      const pcm = sound.make();
      const encoded = await encodeInPage(page, pcm, sound.bitrate);
      if (encoded.failure) throw new Error(`${sound.file}: ${encoded.failure}`);
      const head = encoded.description ? Buffer.from(encoded.description) : null;
      const preSkip = head && head.length >= 12 && head.toString("ascii", 0, 8) === "OpusHead" ? head.readUInt16LE(10) : 312;
      const packets = encoded.packets.map((p) => ({ data: Buffer.from(p.data, "base64"), samples: Math.round((p.duration * RATE) / 1e6) }));
      const bytes = muxOggOpus({ packets, channels: pcm.length, preSkip, samples: pcm[0].length, serial: sound.serial });
      const file = write(sound.file, bytes);
      const check = await decodeInPage(page, bytes);
      const expected = pcm[0].length / RATE;
      if (Math.abs(check.duration - expected) > 0.03) throw new Error(`${sound.file}: decoded ${check.duration}s, expected ${expected}s`);
      if (check.rms < 0.01) throw new Error(`${sound.file}: decoded audio is silent (rms ${check.rms})`);
      results.push({ file, bytes: bytes.length, preSkip, packets: packets.length, expected, decoded: check });
    }
  } finally {
    await browser.close();
  }
  return results;
};

const main = async () => {
  const written = [];
  written.push(write("nova.svg", portraitSvg()));
  written.push(write("dusk.svg", duskSvg()));
  written.push(write("emblem.svg", emblemSvg()));
  for (const [name, layer] of [...hallLayers(), ...vistaLayers()]) {
    written.push(write(name, encodePng(layer.width, layer.height, layer.data)));
  }
  for (const file of written) console.log(`wrote ${file}`);
  const sounds = await encodeSounds();
  for (const s of sounds) {
    console.log(
      `wrote ${s.file} (${s.bytes} bytes, ${s.packets} packets, pre-skip ${s.preSkip}); decoded ${s.decoded.duration.toFixed(3)}s of ${s.expected.toFixed(3)}s, ${s.decoded.channels} ch, rms ${s.decoded.rms.toFixed(3)}, peak ${s.decoded.peak.toFixed(3)}`,
    );
  }
};

await main();
