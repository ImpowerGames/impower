/*
 * Inspired by Pattern Monster <https://pattern.monster>
 */

import { Create } from "../../../core/types/Create";
import { Random } from "../../../core/types/Random";
import { Graphic } from "../types/Graphic";
import { COLOR_PALETTES } from "../constants/COLOR_PALETTES";

const palettes: string[][] = COLOR_PALETTES.flatMap((p) => [
  [...p],
  [...p].reverse(),
]);

const tiling = {
  on: [true],
  zoom: [1, 3],
  angle: [0, 360],
};

const shapes = (weights: number[], paths: string[]) =>
  palettes.flatMap((p) =>
    weights.map((w) => [
      ...(paths[0] ? [{ path: paths[0], fill_color: p[0] }] : []),
      ...(paths[1]
        ? [{ path: paths[1], stroke_color: p[1], stroke_weight: w }]
        : []),
      ...(paths[2]
        ? [{ path: paths[2], stroke_color: p[2], stroke_weight: w }]
        : []),
      ...(paths[3]
        ? [{ path: paths[3], stroke_color: p[3], stroke_weight: w }]
        : []),
      ...(paths[4]
        ? [{ path: paths[4], stroke_color: p[4], stroke_weight: w }]
        : []),
    ])
  );

export const random_graphic_default: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:default",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6, 7],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 12 19 l 8 0 M 12 15 l 8 0 M 28 2 l 8 0 M 28 30 l 8 0 M -4 30 l 8 0 M -4 2 l 8 0",
      "M 14 -4 l 0 8 M 18 -4 l 0 8 M 30 12 l 0 8 M 14 28 l 0 8 M 18 28 l 0 8 M 2 12 l 0 8",
    ]
  ),
});

export const random_graphic_zigzag: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:zigzag",
  tiling,
  shapes: shapes(
    [1, 2, 3],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 0 6 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4",
      "M 0 14 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4",
      "M 0 30 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4",
      "M 0 22 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4 l 4 -4 l 4 4",
    ]
  ),
});

export const random_graphic_bubble: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:bubble",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6, 7],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 32 38 a 1 1 0 0 0 0 -12 a 1 1 0 0 0 0 12 z M 32 6 a 1 1 0 0 0 0 -12 a 1 1 0 0 0 0 12 z M 0 38 a 1 1 0 0 0 0 -12 a 1 1 0 0 0 0 12 z M 0 6 a 1 1 0 0 0 0 -12 a 1 1 0 0 0 0 12 z",
      "M 16 22 a 1 1 0 0 0 0 -12 a 1 1 0 0 0 0 12 z",
      "M 0 19 a 1 1 0 0 0 0 -6 a 1 1 0 0 0 0 6 z M 32 19 a 1 1 0 0 0 0 -6 a 1 1 0 0 0 0 6 z",
      "M 16 3 a 1 1 0 0 0 0 -6 a 1 1 0 0 0 0 6 z M 16 35 a 1 1 0 0 0 0 -6 a 1 1 0 0 0 0 6 z",
    ]
  ),
});

export const random_graphic_circle: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:circle",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 6 4 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 14 4 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 22 4 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 30 4 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z",
      "M 6 12 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 14 12 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 22 12 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 30 12 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z",
      "M 6 20 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 14 20 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 22 20 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 30 20 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z",
      "M 6 28 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 14 28 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 22 28 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z M 30 28 a 1 1 0 0 0 -4 0 a 1 1 0 0 0 4 0 z",
    ]
  ),
});

export const random_graphic_grid: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:grid",
  tiling,
  shapes: shapes(
    [1, 4, 8, 12],
    ["M 0 0 l 32 0 l 0 32 l -32 0 z", "M 16 0 V 32 Z M 0 16 H 32 Z"]
  ),
});

export const random_graphic_herringbone: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:herringbone",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6, 7],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 16 -16 l 16 16 l 0 16 l -16 -16 l 0 -16 z M 32 0 l -16 -16 l 0 16 l 16 16 l 0 -16 z M 32 16 l -16 -16 l 0 16 l 16 16 l 0 -16 z M 32 32 l -16 -16 l 0 16 l 16 16 l 0 -16 z M 0 32 l 16 -16 l 0 16 l -16 16 l 0 -16 z M 0 16 l 16 -16 l 0 16 l -16 16 l 0 -16 z M 0 0 l 16 -16 l 0 16 l -16 16 l 0 -16 Z",
    ]
  ),
});

export const random_graphic_flower: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:flower",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 31 31 c 0 0 0 -3 -1 -4 c -2 -3 -4 -1 -4 -1 c 0 0 -2 2 1 4 c 1 1 4 1 4 1 z M 31 1 c 0 0 -3 0 -4 1 c -3 2 -1 4 -1 4 c 0 0 2 2 4 -1 c 1 -1 1 -4 1 -4 z M 5 30 c 3 -2 1 -4 1 -4 c 0 0 -2 -2 -4 1 c -1 1 -1 4 -1 4 c 0 0 3 0 4 -1 z M 6 6 c 0 0 2 -2 -1 -4 c -1 -1 -4 -1 -4 -1 c 0 0 0 3 1 4 c 2 3 4 1 4 1 z",
      "M 24 16 c 0 0 -1 -2 -3 -2 c -2 0 -3 2 -3 2 c 0 0 1 2 3 2 c 2 0 3 -2 3 -2 z M 14 16 c 0 0 -1 -2 -3 -2 c -2 0 -3 2 -3 2 c 0 0 1 2 3 2 c 2 0 3 -2 3 -2 z M 18 11 c 0 -2 -2 -3 -2 -3 c 0 0 -2 1 -2 3 c 0 2 2 3 2 3 c 0 0 2 -1 2 -3 z M 14 21 c 0 2 2 3 2 3 c 0 0 2 -1 2 -3 c 0 -2 -2 -3 -2 -3 c 0 0 -2 1 -2 3 z",
    ]
  ),
});

export const random_graphic_equal: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:equal",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6, 7],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 12 19 l 8 0 M 12 15 l 8 0 M 28 2 l 8 0 M 28 30 l 8 0 M -4 30 l 8 0 M -4 2 l 8 0",
      "M 14 -4 l 0 8 M 18 -4 l 0 8 M 30 12 l 0 8 M 14 28 l 0 8 M 18 28 l 0 8 M 2 12 l 0 8",
    ]
  ),
});

export const random_graphic_mat: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:mat",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 5.333 32 l 0 -16 M 10.666 16 l 0 16 M 16 32 l -16 0 l 0 -16 M 26.666 0 l 0 16 M 21.333 16 l 0 -16 M 16 0 l 16 0 l 0 16 M 16 21.333 l 16 0 M 32 26.666 l -16 0 M 16 16 l 16 0 l 0 16 l -16 0 l 0 -16 z M 0 5.333 l 16 0 M 16 10.666 l -16 0 M 0 0 l 16 0 l 0 16 l -16 0 l 0 -16 z",
    ]
  ),
});

export const random_graphic_memphis: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:memphis",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M -2 2 l 4 6 l 6 -4 M 15 14 l -6 3 l 3 6 M -4 17 l -2 7 l 7 2 M 30 2 l 4 6 l 6 -4 M 28 17 l -2 7 l 7 2",
      "M 27 29 l 0 1 l 1 0 M 2 12 l -1 1 l 1 1 M 6 21 l -1 -1 l -1 1 M 17 25 l 0 1 l 1 0",
      "M 27 13 l -1 -5 l -5 1 M 15 -2 l 1 5 l 5 -1 M 15 30 l 1 5 l 5 -1",
      "M 4 29 l 3 1 l 1 -3 M 23 20 l -2 -2 l -2 2 M 12 11 l 2 -2 l -2 -2",
    ]
  ),
});

export const random_graphic_net: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:net",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6, 7],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M -8 -4 l 16 8 l 16 -8 l 16 8 M -8 28 l 16 8 l 16 -8 l 16 8 M -8 12 l 16 8 l 16 -8 l 16 8 M -4 40 l 8 -16 l -8 -16 l 8 -16 M 28 40 l 8 -16 l -8 -16 l 8 -16 M 12 40 l 8 -16 l -8 -16 l 8 -16",
    ]
  ),
});

export const random_graphic_octagon: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:octagon",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 12 0 l 0 5 c -3 1 -6 4 -7 7 l -5 0 M 0 20 l 5 0 c 1 3 4 6 7 7 l 0 5 M 20 32 l 0 -5 c 3 -1 6 -4 7 -7 l 5 0 M 32 12 l -5 0 c -1 -3 -4 -6 -7 -7 l 0 -5 ",
      "M 4 0 a 1 1 0 0 0 -8 0 a 1 1 0 0 0 8 0 z M 36 0 a 1 1 0 0 0 -8 0 a 1 1 0 0 0 8 0 z M 4 32 a 1 1 0 0 0 -8 0 a 1 1 0 0 0 8 0 z M 36 32 a 1 1 0 0 0 -8 0 a 1 1 0 0 0 8 0 z",
      "M 16 28 l 0 12 M 40 16 l -12 0 M 4 16 l -12 0 M 16 -8 l 0 12",
      "M 16 11 l 5 5 l -5 5 l -5 -5 l 5 -5 z",
    ]
  ),
});

export const random_graphic_plus: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:plus",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6, 7],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 40 16 h -6 M 30 16 h -6 M 32 24 v -6 M 32 14 v -6 M 8 16 h -6 M -2 16 h -6 M 0 24 v -6 M 0 14 v -6",
      "M 15 -1 l -4 -4 M 17 1 l 4 4 M 17 -1 l 4 -4 M 15 1 l -4 4 M 15 31 l -4 -4 M 17 33 l 4 4 M 17 31 l 4 -4 M 15 33 l -4 4",
    ]
  ),
});

export const random_graphic_brick: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:brick",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4, 5, 6, 7],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 0 24 l 32 0 l 0 16 l -32 0 l 0 -16 z M 16 8 l 32 0 l 0 16 l -32 0 M -16 8 l 32 0 l 0 16 l -32 0 l 0 -16 z M 0 -8 l 32 0 l 0 16 l -32 0 l 0 -16 z",
    ]
  ),
});

export const random_graphic_tile: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:tile",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 32 8 l 0 16 M 0 8 l 0 16 M 8 0 l 16 0 M 8 32 l 16 0",
      "M 32 40 l -8 -8 l 8 -8 l 8 8 l -8 8 z M 0 40 l -8 -8 l 8 -8 l 8 8 l -8 8 z M 32 8 l -8 -8 l 8 -8 l 8 8 l -8 8 z M 0 8 l -8 -8 l 8 -8 l 8 8 l -8 8 z",
      "M 16 -8 l 0 16 M 16 24 l 0 16 M -8 16 l 16 0 M 24 16 l 16 0",
      "M 16 24 l -8 -8 l 8 -8 l 8 8 l -8 8 z",
    ]
  ),
});

export const random_graphic_wave: Create<Random<Graphic>> = () => ({
  $type: "graphic",
  $name: "$random:wave",
  tiling,
  shapes: shapes(
    [1, 2, 3, 4],
    [
      "M 0 0 l 32 0 l 0 32 l -32 0 z",
      "M 0 6 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2",
      "M 0 14 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2",
      "M 0 22 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2",
      "M 0 30 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2 c 2 0 3 -1 4 -2 c 1 -1 2 -2 4 -2 c 2 0 3 1 4 2 c 1 1 2 2 4 2",
    ]
  ),
});
