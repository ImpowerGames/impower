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
