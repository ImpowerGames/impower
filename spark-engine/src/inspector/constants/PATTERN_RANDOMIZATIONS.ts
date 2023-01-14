import { Pattern } from "../../game";
import { RecursiveRandomization } from "../types/RecursiveRandomization";
import { COLOR_PALETTES } from "./COLOR_PALETTES";
import { PATTERN_GRAPHICS } from "./PATTERN_GRAPHICS";

export const PATTERN_RANDOMIZATIONS: Record<
  string,
  RecursiveRandomization<Pattern>
> = Object.entries(PATTERN_GRAPHICS).reduce((p, c) => {
  const [k, v] = c;
  p[k] = {
    weight: [1, 6.5],
    zoom: [1, 3],
    angle: [0, 360],
    colors: COLOR_PALETTES.flatMap((p) => [
      [...p],
      [...p].reverse(),
      ...(v.paths?.length === 1
        ? [[COLOR_PALETTES[0][0], ...[...p].reverse().slice(1)]]
        : []),
    ]),
    graphic: [v],
  };
  return p;
}, {} as Record<string, RecursiveRandomization<Pattern>>);
