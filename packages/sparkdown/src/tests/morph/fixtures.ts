import { buildMorphRecipe } from "../../morph/recipe";
import type { MorphRecipe } from "../../morph/types";

export const UPPER_OPEN = "M0,50 C30,5 70,5 100,50 C70,25 30,25 0,50Z";
export const LOWER_OPEN = "M0,50 C30,75 70,75 100,50 C70,85 30,85 0,50Z";
export const CLOSED = "M0,50 C30,44 70,44 100,50 C70,50 30,50 0,50Z";
export const SPLIT_CLOSED_TOP_SHORT_OF_OUTER_TIP = "M0,50 C30,43 70,43 92,45 C75,54 30,54 0,50Z";
export const SPLIT_CLOSED_BOTTOM_OVERLAPPING_TOP = "M0,50 C30,45 70,45 100,47 C70,54 30,54 0,50Z";
export const EYEBALL = "M-5,50 C-5,20 105,20 105,50 C105,80 -5,80 -5,50Z";
export const PUPIL = "M40,50 C40,40 60,40 60,50 C60,60 40,60 40,50Z";

export const linedSquare = (x: number, y: number, scale: number, inset: number) => {
  const p = (px: number, py: number) => `${x + px * scale},${y + py * scale}`;
  const d = inset;
  return [
    `M${p(0, 0)}L${p(100, 0)}L${p(100, 100)}L${p(0, 100)}L${p(0, 0)}L${p(20, 20)}`,
    `L${p(20 + d, 20 + d)}L${p(80 - d, 20 + d)}L${p(80 - d, 20 + 2 * d)}L${p(20 + d, 20 + 2 * d)}L${p(20 + d, 20 + d)}L${p(20, 20)}`,
    `L${p(80, 20)}`,
    `L${p(80 - d, 20 + 3 * d)}L${p(80 - d, 80 - 3 * d)}L${p(80 - 2 * d, 80 - 3 * d)}L${p(80 - 2 * d, 20 + 3 * d)}L${p(80 - d, 20 + 3 * d)}L${p(80, 20)}`,
    `L${p(80, 80)}`,
    `L${p(80 - 3 * d, 80 - d)}L${p(20 + d, 80 - d)}L${p(20 + d, 80 - 2 * d)}L${p(80 - 3 * d, 80 - 2 * d)}L${p(80 - 3 * d, 80 - d)}L${p(80, 80)}`,
    `L${p(20, 80)}`,
    `L${p(20 + d, 80 - 3 * d)}L${p(20 + d, 20 + 3 * d)}L${p(20 + 2 * d, 20 + 3 * d)}L${p(20 + 2 * d, 80 - 3 * d)}L${p(20 + d, 80 - 3 * d)}L${p(20, 80)}`,
    `L${p(20, 20)}L${p(0, 0)}Z`,
  ].join("");
};

const sliver = (x: number, y: number, h: number) => `M${x + 4},${y + 2 * h}L${x + 6},${y}L${x + 10},${y}L${x + 10},${y + 10}L${x},${y + 10}L${x},${y}L${x + 4},${y}L${x + 6},${y + 2 * h}Z`;

const shift = (d: string, dx: number, dy = 0) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${Number(x) + dx},${Number(y) + dy}`);

export interface EyeOptions {
  dx?: number;
  dy?: number;
  right?: boolean;
  openTransform?: string;
}

const eye = (side: "left" | "right", dx: number, dy: number) => ({
  white: `<path data-name="eyeball-white-${side}" d="${shift(EYEBALL, dx, dy)}" fill="#fff"/>`,
  pupil: `<path data-name="pupil-${side}" d="${shift(PUPIL, dx, dy)}" fill="#234"/>`,
  upper: `<path data-name="eyelash-${side}" d="${shift(UPPER_OPEN, dx, dy)}" fill="#111"/>`,
  lower: `<path data-name="eyelash-${side}" d="${shift(LOWER_OPEN, dx, dy)}" fill="#111"/>`,
  closed: `<path data-name="eyelash-${side}" d="${shift(CLOSED, dx, dy)}" fill="#111"/>`,
});

export function portrait(options: EyeOptions = {}): string {
  const dx = options.dx ?? 20;
  const dy = options.dy ?? 10;
  const left = eye("left", dx, dy);
  const right = eye("right", dx + 120, dy);
  const transform = options.openTransform ? ` transform="${options.openTransform}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 140" width="260" height="140">
<defs><linearGradient id="skin"><stop offset="0" stop-color="#fdb"/><stop offset="1" stop-color="#ca8"/></linearGradient></defs>
<path data-name="face" d="M0,0H260V140H0Z" fill="url(#skin)"/>
<g data-name="eyes.open:default"${transform}>
${left.white}${left.pupil}${left.upper}${left.lower}
${options.right ? `${right.white}${right.pupil}${right.upper}${right.lower}` : ""}
</g>
<g data-name="eyes.closed">
${left.closed}${options.right ? right.closed : ""}
</g>
<path data-name="nose" d="M120,90L130,110L110,110Z" fill="#a76"/>
</svg>`;
}

export function layeredPortrait(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="400" height="240">
<defs>
<linearGradient id="white"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dde"/></linearGradient>
<linearGradient id="white-tint" href="#white" gradientTransform="rotate(10)"/>
<clipPath id="iris-cut"><rect x="35" y="35" width="30" height="20"/></clipPath>
</defs>
<path data-name="face" d="M100,2 C165,2 198,30 198,60 C198,92 165,118 100,118 C35,118 2,92 2,60 C2,30 35,2 100,2Z" fill="#fdb"/>
<g data-name="head" transform="translate(30 10)">
<g data-name="eyeballs" transform="scale(1)">
<g data-name="eyes.open:default">
<g data-name="eyeball-left">
<path data-name="eyeball-white" d="${EYEBALL}" fill="url(#white-tint)"/>
<path data-name="iris" d="${PUPIL}" fill="#365" clip-path="url(#iris-cut)"/>
</g>
<path data-name="eyeball-shadow-left" d="${UPPER_OPEN}" fill="#000" opacity="0.3"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyeball-shadow-left" d="${CLOSED}" fill="#000" opacity="0.3"/>
</g>
</g>
<path data-name="cheeks" d="M0,60H100V70H0Z" fill="#f99" opacity="0.5"/>
<g data-name="lashes" transform="translate(0 0)">
<g data-name="eyes.open:default">
<path data-name="eyelash-left" d="${UPPER_OPEN}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER_OPEN}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>
</g>
</g>
</g>
<path data-name="hair" d="M0,0H200V8H0Z" fill="#432"/>
</svg>`;
}

export function shadowedPortrait(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="face" d="M0,0H140V100H0Z" fill="#b76"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/>
<path data-name="eyeball-shadow-left" d="${UPPER_OPEN}" fill="#ccc"/>
<path data-name="pupil-left" d="${PUPIL}" fill="#000"/>
<path data-name="eyelash-left" d="${UPPER_OPEN}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER_OPEN}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyeball-shadow-left" d="${CLOSED}" fill="#ccc"/>
<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>
</g>
</svg>`;
}

export interface PartnerEyeOptions {
  closed?: string;
  closedShadow?: boolean;
  more?: Record<string, string>;
  shadow?: string;
}

export function partnerPortrait(options: PartnerEyeOptions = {}): string {
  const closed = options.closed ?? `<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>`;
  const more = Object.entries(options.more ?? {})
    .map(([state, drawings]) => `<g data-name="eyes.${state}">\n${drawings}\n</g>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="face" d="M0,0H140V100H0Z" fill="#b76"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/>
<g transform="translate(0 -2)"><path data-name="eyeball-shadow-left" d="${shift(UPPER_OPEN, 0, 2)}" ${options.shadow ?? 'fill="#ccc"'}/></g>
<path data-name="pupil-left" d="${PUPIL}" fill="#000"/>
<path data-name="eyelash-left" d="${UPPER_OPEN}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER_OPEN}" fill="#111"/>
</g>
<g data-name="eyes.closed">
${options.closedShadow ? `<path data-name="eyeball-shadow-left" d="${CLOSED}" fill="#ccc"/>` : ""}
${closed}
</g>
${more}
</svg>`;
}

export const shiftPath = shift;

export function talkingPortrait(options: EyeOptions & { mouth?: string } = {}): string {
  const at = (d: string) => shift(d, 140, 40);
  const mouth = `<g data-name="mouth.open:default">
<path data-name="teeth" d="${at(EYEBALL)}" fill="#eee"/>
<path data-name="lip" d="${at(UPPER_OPEN)}" fill="#a33"/>
<path data-name="lip" d="${at(LOWER_OPEN)}" fill="#a33"/>
${options.mouth ?? ""}
</g>
<g data-name="mouth.closed">
<path data-name="lip" d="${at(CLOSED)}" fill="#a33"/>
</g>`;
  return portrait(options).replace("</svg>", `${mouth}\n</svg>`);
}

export const talkScript = (extra = "", name = "talk") => `morph ${name} {
  method = bend
${extra}  keyframes {
    0% {
      mouth {
        state = open
      }
    }
    50% {
      mouth {
        state = closed
      }
    }
    100% {
      mouth {
        state = open
      }
    }
  }
  clips {
    {
      between {
        lip
      }
      targets {
        teeth
      }
    }
  }
}
`;

export function talk(overrides: Record<string, unknown> = {}): MorphRecipe {
  return buildMorphRecipe("talk", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    keyframes: [
      { offset: 0, mouth: { state: "open" } },
      { offset: 0.5, mouth: { state: "closed" } },
      { offset: 1, mouth: { state: "open" } },
    ],
    clips: [{ between: ["lip"], targets: ["teeth"] }],
    ...overrides,
  });
}

export const blinkScript = (extra = "") => `morph blink {
  method = bend
${extra}  keyframes {
    0% {
      eyes {
        state = open
      }
    }
    33.333% {
      eyes {
        state = closed
      }
    }
    100% {
      eyes {
        state = open
      }
    }
  }
  clips {
    {
      between {
        eyelash-left
      }
      targets {
        eyeball-white-left
        pupil-left
      }
    }
  }
}
`;

export function blink(overrides: Record<string, unknown> = {}, right = false): MorphRecipe {
  return buildMorphRecipe("blink", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    keyframes: [
      { offset: 0, eyes: { state: "open" } },
      { offset: 0.333, eyes: { state: "closed" } },
      { offset: 1, eyes: { state: "open" } },
    ],
    clips: [
      { between: ["eyelash-left"], targets: ["eyeball-white-left", "pupil-left"] },
      ...(right ? [{ between: ["eyelash-right"], targets: ["eyeball-white-right", "pupil-right"] }] : []),
    ],
    ...overrides,
  });
}

const box = (x: number, y: number, w: number, h: number) => `M${x},${y}H${x + w}V${y + h}H${x}Z`;

export function paintedPortrait(): string {
  const pose = (dy: number) => ({
    lash: `<path data-name="lash" d="${box(10, 10 + dy, 30, 10)}" fill="#000"/>`,
    brow: `<path data-name="brow" d="${box(50, 5 + dy, 30, 5)}" fill="#432"/>`,
    cheek: `<path data-name="cheek" d="${box(10, 50 + dy, 20, 10)}"/>`,
    crease: `<path data-name="crease" d="${box(50, 50 + dy, 20, 10)}" fill="#c96"/>`,
    lid: `<path data-name="lid" d="${box(90, 10 + dy, 20, 10)}" fill="#fff"/>`,
    shine: `<path data-name="shine" d="${box(90, 50 + dy, 20, 10)}" fill="#fff"/>`,
    shadow: `<path data-name="shadow" d="${box(130, 10 + dy, 20, 10)}" fill="#000"/>`,
    glint: `<path data-name="glint" d="${box(130, 50 + dy, 20, 10)}" fill="#000"/>`,
    veil: `<path data-name="veil" d="${box(50, 80 + dy, 20, 5)}" fill="#000" stroke="#000"/>`,
    freckle: `<path data-name="freckle" d="${box(90, 80 + dy, 20, 5)}" fill="#fff"/>`,
    spot: `<path data-name="spot" d="${box(10, 80 + dy, 10, 5)}" fill="#fff"/>`,
    dot: `<path data-name="dot" d="${box(25, 80 + dy, 10, 5)}" fill="#fff"/>`,
    mark: `<path data-name="mark" d="${box(130, 80 + dy, 10, 5)}" fill="#fff"/>`,
    blot: `<path data-name="blot" d="${box(145, 80 + dy, 10, 5)}" fill="#fff"/>`,
  });
  const open = pose(0);
  const half = pose(5);
  const closed = pose(10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" width="160" height="100" color="#0f0">
<defs><linearGradient id="gleam"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ccc"/></linearGradient></defs>
<path data-name="face" d="M0,0H160V100H0Z" fill="#fdb"/>
<g data-name="eyes.open:default">
${open.lash}${open.brow}<g fill="#00f">${open.cheek}</g>${open.crease}
${open.lid.replace('fill="#fff"', 'fill="#fff" style="fill:#000 !important"')}${open.shine.replace("#fff", "url(#gleam)")}
${open.shadow}${open.glint}${open.veil}${open.freckle.replace('fill="#fff"', 'color="none" fill="currentColor"')}
${open.spot.replace('fill="#fff"', 'color="#f00" style="color:none" fill="currentColor"')}${open.dot.replace('fill="#fff"', 'style="color:#00f;color:none !important" fill="currentColor"')}
<g fill="#f00" style="fill:unset">${open.mark.replace(' fill="#fff"', "")}</g>${open.blot.replace('fill="#fff"', 'fill="rgb(100% 0 0)"')}
</g>
<g data-name="eyes.half">
${half.shadow.replace("#000", "#00f")}${half.glint}
</g>
<g data-name="eyes.closed" color="#f00">
${closed.lash.replace("#000", "#fff")}${closed.brow}${closed.cheek.replace("<path", '<path fill="currentColor"')}
${closed.crease.replace('fill="#c96"', 'fill="#c96" stroke="#f00"')}${closed.lid}${closed.shine}
${closed.shadow.replace("#000", "#f00")}${closed.glint.replace("#000", "#f00")}
${closed.veil.replace("/>", ' fill-opacity="0.5" stroke-opacity="0.2" opacity="0.4"/>')}${closed.freckle}${closed.spot}${closed.dot}${closed.mark}${closed.blot}
</g>
</svg>`;
}

export function gradientPortrait(): string {
  const two = (a: string, b: string) => `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`;
  const pose = (dy: number, closed: boolean) => {
    const placed = closed ? ` transform="translate(0 ${dy})"` : "";
    return [
      `<path data-name="highlight" d="${box(10, 10 + dy, 20, 20)}" fill="url(#hl-${closed ? "closed" : "open"})"/>`,
      `<path data-name="liner" d="${box(40, 10 + dy, 20, 10)}" fill="url(#liner-${closed ? "closed" : "open"})"/>`,
      `<path data-name="glow" d="${box(70, 10, 20, 10)}"${placed} fill="url(#glow)"/>`,
      `<path data-name="sheen" d="${box(100, 10, 20, 10)}"${placed} fill="url(#sheen-${closed ? "closed" : "open"})"/>`,
      `<path data-name="stripe" d="${box(10, 50 + dy, 20, 10)}" fill="url(#stripe-${closed ? "closed" : "open"})"/>`,
      `<path data-name="patch" d="${box(40, 50 + dy, 20, 10)}" fill="${closed ? "#0f0" : "url(#liner-open)"}"/>`,
      `<path data-name="plain" d="${box(70, 50 + dy, 20, 10)}" fill="url(#liner-open)"/>`,
    ].join("");
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" width="160" height="100">
<defs>
<radialGradient id="hl-open" gradientUnits="userSpaceOnUse" cx="20" cy="20" r="10">${two("#fff", "rgba(255,255,255,0)")}</radialGradient>
<radialGradient id="hl-closed" href="#hl-open" gradientTransform="translate(0 10)"/>
<linearGradient id="liner-open">${two("#f00", "#00f")}</linearGradient>
<linearGradient id="liner-closed">${two("#0f0", "#00f")}</linearGradient>
<linearGradient id="glow" gradientUnits="userSpaceOnUse" x1="70" y1="10" x2="90" y2="20">${two("#ff0", "#f0f")}</linearGradient>
<linearGradient id="sheen-open" x2="0%" y2="100%">${two("#fff", "#000")}</linearGradient>
<linearGradient id="sheen-closed" x2="0%" y2="100%"><stop offset="50%" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<linearGradient id="stripe-open">${two("#fff", "#000")}</linearGradient>
<linearGradient id="stripe-closed">${two("#fff", "#000")}<stop offset="1" stop-color="#f00"/></linearGradient>
</defs>
<path data-name="face" d="M0,0H160V100H0Z" fill="#fdb"/>
<g data-name="eyes.open:default">${pose(0, false)}</g>
<g data-name="eyes.closed">${pose(10, true)}</g>
</svg>`;
}

export function maskedPortrait(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100" width="140" height="100">
<path data-name="skin" d="M0,0H140V100H0Z" fill="#b76"/>
<g data-name="face.masked">
<g data-name="underlay:mask.on"><path data-name="darkness" d="M0,20H140V80H0Z" fill="#000"/></g>
</g>
<g data-name="face.plain:default"><path data-name="cheek" d="M0,80H140V90H0Z" fill="#d98"/></g>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/>
<path data-name="pupil-left" d="${PUPIL}" fill="#000"/>
<path data-name="eyelash-left" d="${UPPER_OPEN}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER_OPEN}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>
</g>
</svg>`;
}

export const MASKED_VARIANTS = {
  masked: { face: "masked", mask: "on" },
  maskOnly: { face: "plain", mask: "on" },
  unmasked: { face: "masked", mask: "off" },
} as const;

export function maskedBlink(paints: Record<string, unknown>[] = []): MorphRecipe {
  return buildMorphRecipe("blink", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    keyframes: [
      { offset: 0, eyes: { state: "open" } },
      { offset: 1 / 3, eyes: { state: "closed" } },
      { offset: 1, eyes: { state: "open" } },
    ],
    clips: [{ between: ["eyelash-left"], targets: ["eyeball-white-left", "pupil-left"] }],
    paints,
  });
}

export function paintBlink(overrides: Record<string, unknown> = {}, states = ["open", "closed", "open"]): MorphRecipe {
  return buildMorphRecipe("blink", {
    blend: "morph",
    method: "match",
    fallback: "fade",
    keyframes: states.map((state, i) => ({ offset: i / (states.length - 1), eyes: { state } })),
    ...overrides,
  });
}

export const SPREAD_LABELS = ["flat", "blended", "sheer", "graded", "veiled", "tinted", "fader", "ghost", "stroked", "patterned", "mottled", "masked", "still"] as const;

const slotted = (x: number, y: number, a: [number, number], b: [number, number]) =>
  `M${x},${y}L${x + 4},${y}L${x + a[0]},${y + a[1]}L${x + b[0]},${y + b[1]}L${x + 6},${y}L${x + 10},${y}L${x + 10},${y + 10}L${x},${y + 10}Z`;

export function spreadPortrait(): string {
  const two = (a: string, b: string, opacity = "1") =>
    `<stop offset="0" stop-color="${a}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${b}" stop-opacity="${opacity}"/>`;
  const pose = (dy: number, closed: boolean) => {
    const at = (i: number) => box(10 + (i % 5) * 35, 10 + Math.floor(i / 5) * 35 + dy, 25, 15);
    const drawings: Record<string, string> = {
      flat: 'fill="#345"',
      blended: `fill="${closed ? "#00f" : "#f00"}"`,
      sheer: 'fill="#0a0" fill-opacity="0.5"',
      graded: `fill="url(#graded-${closed ? "closed" : "open"})"`,
      veiled: `fill="url(#veiled-${closed ? "closed" : "open"})"`,
      tinted: 'fill="#888"',
      fader: 'fill="#eee"',
      stroked: 'fill="#000" stroke="#f00"',
      patterned: 'fill="url(#dots)"',
      mottled: 'fill="url(#mottle)"',
      masked: 'fill="#111" mask="url(#own)"',
      still: 'fill="#222"',
    };
    if (!closed) drawings["ghost"] = 'fill="#456"';
    const lettered = `<text data-name="lettered" x="10" y="${170 + dy}" fill="#000">TEST</text>`;
    const overlapping = (x: number) => `M${x},${125 + dy}H${x + 15}V${140 + dy}H${x}Z M${x + 10},${125 + dy}H${x + 25}V${140 + dy}H${x + 10}Z`;
    const extra = [
      `<path data-name="doubled" d="${overlapping(80)}" fill="#246"/>`,
      `<path data-name="holed" d="${overlapping(115)}" fill="#246" fill-rule="evenodd"/>`,
      `<path data-name="opened" d="M150,${125 + dy}H175V${140 + dy}H150" fill="#642"/>`,
      `<path data-name="crossing" d="M${closed ? 40 : 10},${148 + dy}H${closed ? 50 : 20}V${158 + dy}H${closed ? 40 : 10}Z M${closed ? 10 : 40},${148 + dy}H${closed ? 20 : 50}V${158 + dy}H${closed ? 10 : 40}Z" fill="#264"/>`,
      `<polyline data-name="polylined" points="60,${148 + dy} 80,${148 + dy} 80,${158 + dy} 60,${158 + dy}" fill="#426"/>`,
      `<path data-name="speck" d="M115,${148 + dy}H140V${158 + dy}H115Z M120,${150 + dy}H120.04V${150.04 + dy}H120Z" fill="#462"/>`,
      `<path data-name="ringed" d="M120,${80 + dy}H140V${100 + dy}H120Z M125,${85 + dy}H135V${95 + dy}H125Z M125,${85 + dy}H135V${95 + dy}H125Z" fill="#624" fill-rule="evenodd"/>`,
      `<path data-name="cornered" d="M150,${80 + dy}H160V${90 + dy}H150Z M159,${89 + dy}H169V${99 + dy}H159Z" fill="#246"/>`,
      `<path data-name="folding" d="${slotted(180, 100 + dy, closed ? [6.3, 5.1] : [7.6, 6.8], closed ? [7.9, 8.9] : [6, 3.1])}" fill="#264"/>`,
      `<path data-name="looped" d="${slotted(150, 105 + dy, [6, 4], [4, 4])}" fill="#426"/>`,
      `<path data-name="loopedodd" d="${slotted(165, 105 + dy, [6, 4], [4, 4])}" fill="#426" fill-rule="evenodd"/>`,
      `<path data-name="curled" d="M150,${175 + dy}C165,${169 + dy} 145,${169 + dy} 160,${175 + dy}L160,${165 + dy}L150,${165 + dy}Z" fill="#462"/>`,
      `<path data-name="slivered" d="${sliver(60, 160 + dy, 0.0008)}" fill="#246"/>`,
      `<path data-name="wedged" d="${sliver(80, 160 + dy, 0.0012)}" fill="#246"/>`,
      `<path data-name="lined" d="${linedSquare(120, 160 + dy, 0.1, 0.001)}" fill="#264"/>`,
      `<path data-name="retraced" d="M100,${160 + dy}L110,${160 + dy}L110,${170 + dy}L100,${170 + dy}L100,${160 + dy}L102,${162 + dy}L108,${162 + dy}L108,${168 + dy}L102,${168 + dy}L102,${162 + dy}L108,${162 + dy}L108,${168 + dy}L102,${168 + dy}L102,${162 + dy}L100,${160 + dy}Z" fill="#462"/>`,
      closed
        ? `<path data-name="mixedfade" d="M120,${105 + dy}H130V${115 + dy}H120Z" fill="#624"/>`
        : `<path data-name="mixedfade" d="${slotted(120, 105 + dy, [6, 4], [4, 4])}" fill="#624" fill-rule="evenodd"/>`,
      `<path data-name="implicitloop" d="M106,${106 + dy}L108,${102 + dy}L112,${102 + dy}L112,${112 + dy}L102,${112 + dy}L102,${102 + dy}L106,${102 + dy}L108,${106 + dy}" fill="#264"/>`,
    ];
    return [...SPREAD_LABELS.flatMap((label, i) => (drawings[label] ? [`<path data-name="${label}" d="${at(i)}" ${drawings[label]}/>`] : [])), ...extra, lettered].join("\n");
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" width="200" height="180">
<defs>
<linearGradient id="graded-open">${two("#f00", "#ff0")}</linearGradient>
<linearGradient id="graded-closed">${two("#00f", "#0ff")}</linearGradient>
<linearGradient id="veiled-open">${two("#f00", "#ff0", "0.5")}</linearGradient>
<linearGradient id="veiled-closed">${two("#00f", "#0ff", "0.5")}</linearGradient>
<linearGradient id="mottle"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></linearGradient>
<pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0,0H2V2H0Z" fill="#000"/></pattern>
<mask id="own"><path d="M0,0H200V180H0Z" fill="#fff"/></mask>
</defs>
<path data-name="face" d="M0,0H200V180H0Z" fill="#fdb"/>
<g data-name="eyes.open:default">
${pose(0, false)}
</g>
<g data-name="eyes.closed">
${pose(5, true)}
</g>
</svg>`;
}

export function spreadBlink(layers: Record<string, Record<string, unknown>> = {}, overrides: Record<string, unknown> = {}, states = ["open", "closed", "open"]): MorphRecipe {
  const merged: Record<string, Record<string, unknown>> = { ghost: { fallback: "scale" }, fader: { blend: "fade" }, still: { blend: "cut" }, opened: { blend: "fade" }, polylined: { blend: "fade" }, implicitloop: { blend: "fade" }, mixedfade: { blend: "fade" }, curled: { blend: "fade" }, slivered: { blend: "fade" }, wedged: { blend: "fade" }, retraced: { blend: "fade" }, lined: { blend: "fade" } };
  for (const [label, policy] of Object.entries(layers)) merged[label] = { ...merged[label], ...policy };
  return paintBlink({ layers: merged, ...overrides }, states);
}
