import { buildMorphRecipe } from "../../morph/recipe";
import type { MorphRecipe } from "../../morph/types";

// Synthetic eye art at roughly portrait scale, built from the geometry
// package's lash fixtures: two open lashes (upper and lower) converge on one
// closed lash, and the eyeball and pupil sit behind them.

export const UPPER_OPEN = "M0,50 C30,5 70,5 100,50 C70,25 30,25 0,50Z";
export const LOWER_OPEN = "M0,50 C30,75 70,75 100,50 C70,85 30,85 0,50Z";
export const CLOSED = "M0,50 C30,44 70,44 100,50 C70,50 30,50 0,50Z";
/** Wider than the aperture, so the clip has something to trim at rest. */
export const EYEBALL = "M-5,50 C-5,20 105,20 105,50 C105,80 -5,80 -5,50Z";
export const PUPIL = "M40,50 C40,40 60,40 60,50 C60,60 40,60 40,50Z";

const shift = (d: string, dx: number, dy = 0) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${Number(x) + dx},${Number(y) + dy}`);

export interface EyeOptions {
  /** Where the left eye sits; the right eye, when drawn, is 120 units further. */
  dx?: number;
  dy?: number;
  right?: boolean;
  /** Wraps the open-state group in this transform. */
  openTransform?: string;
}

const eye = (side: "left" | "right", dx: number, dy: number) => ({
  white: `<path data-name="eyeball-white-${side}" d="${shift(EYEBALL, dx, dy)}" fill="#fff"/>`,
  pupil: `<path data-name="pupil-${side}" d="${shift(PUPIL, dx, dy)}" fill="#234"/>`,
  upper: `<path data-name="eyelash-${side}" d="${shift(UPPER_OPEN, dx, dy)}" fill="#111"/>`,
  lower: `<path data-name="eyelash-${side}" d="${shift(LOWER_OPEN, dx, dy)}" fill="#111"/>`,
  closed: `<path data-name="eyelash-${side}" d="${shift(CLOSED, dx, dy)}" fill="#111"/>`,
});

/**
 * A portrait: a gradient-filled face below, the eyes' state layers in the
 * middle, and a nose drawn above them, so live art is interleaved with
 * static art on both sides.
 */
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

/**
 * The harder portrait: the eyes' state layers sit in two separate runs (the
 * eyeball group below the cheek shading, the lashes above it), inside nested
 * transforms. The eyeball is a group target (white with a gradient, an iris
 * that keeps its own authored clip) and the shadow morphs between an open
 * and a closed drawing while clipped. Both open lashes converge on one
 * closed lash.
 */
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

/**
 * The prepared portrait's eye: the open state holds the white, an eyeball
 * shadow along the upper lid, the pupil and two lashes; the closed state
 * holds the shadow's copy of the closed lash, drawn behind that lash. Both
 * shadows are clip targets, so the shadow morphs while clipped.
 */
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

/** The blink as a script declares it; `extra` lines go in the morph's root. */
export const blinkScript = (extra = "") => `morph blink with
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
end
`;

/** The blink of the design: open, closed at a third, open again. */
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

/**
 * A portrait whose paired drawings differ in paint, one case per label, each
 * drawn open, half-closed and closed: `lash` black open and white closed;
 * `brow` the same paint throughout; `crease` stroked only when closed;
 * `cheek` filled by its open group and by `currentColor` closed; `lid`
 * filled by an important inline declaration open; `shine` filled by a
 * gradient open; `veil` with its fill, stroke and own opacities lowered
 * when closed; `shadow`, black open, blue half-closed and red closed;
 * `glint`, black open and half-closed and red closed. The rest are white
 * closed and open in paint decided by a declaration outside the paint
 * grammar, so they stay unblended: `freckle` in `currentColor` under
 * `color="none"`; `spot` in `currentColor` with a red `color` attribute and
 * an inline `color:none`; `dot` in `currentColor` with an inline blue
 * `color` and an important `color:none` after it; `mark` in a red-filled
 * group with an inline `all:initial`; and `blot` with an `rgb()` fill spaced
 * by no-break spaces.
 */
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

/**
 * A portrait whose paired drawings paint with gradients, one case per label,
 * each closed drawing 10 units below its open one:
 *
 * - `highlight`: a user-space radial highlight with the same stops in both
 *   drawings, the closed gradient taking everything from the open one through
 *   `href` and moved down by its `gradientTransform`.
 * - `liner`: a bounding-box linear gradient whose first stop is red open and
 *   lime closed.
 * - `glow`: one user-space gradient both drawings name, the closed drawing
 *   placed by its own transform, so its gradient sits 10 units lower too.
 * - `sheen`: a bounding-box gradient whose first stop moves from 0 to 0.5,
 *   the closed drawing placed by its own transform.
 * - `stripe`: two stops open, three closed.
 * - `patch`: a gradient open, a solid colour closed.
 * - `plain`: one bounding-box gradient both drawings name.
 */
export function gradientPortrait(): string {
  const two = (a: string, b: string) => `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`;
  const pose = (dy: number, closed: boolean) => {
    // Drawings placed by their own transform keep the open geometry.
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

/**
 * A masked portrait: two open lashes converge on one closed lash over the
 * eyeball, and a masked face draws a black `darkness` underlay that needs
 * `mask.on` through its `underlay` group. `face.masked` with `mask.on` draws
 * the underlay; `face.plain` with `mask.on` selects the mask but draws
 * nothing that needs it; `face.masked` with `mask.off` is unmasked.
 */
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

/** The three variants of `maskedPortrait`. */
export const MASKED_VARIANTS = {
  masked: { face: "masked", mask: "on" },
  maskOnly: { face: "plain", mask: "on" },
  unmasked: { face: "masked", mask: "off" },
} as const;

/** The masked portrait's blink: open, closed at a third, open again, with `paints` entries. */
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

/** Open to closed at the middle and back, every label moving with `match`. */
export function paintBlink(overrides: Record<string, unknown> = {}, states = ["open", "closed", "open"]): MorphRecipe {
  return buildMorphRecipe("blink", {
    blend: "morph",
    method: "match",
    fallback: "fade",
    keyframes: states.map((state, i) => ({ offset: i / (states.length - 1), eyes: { state } })),
    ...overrides,
  });
}
