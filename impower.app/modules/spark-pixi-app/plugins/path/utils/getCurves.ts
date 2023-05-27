import { Curve } from "../types/Curve";
import { absolutizePath } from "./absolutizePath";
import { normalizePath } from "./normalizePath";
import { parsePath } from "./parsePath";

export const getCurves = (path: string): Curve[] => {
  const commands = normalizePath(absolutizePath(parsePath(path)));
  const curves: Curve[] = [];
  commands.forEach((c) => {
    if (c.command === "M") {
      const x = c.data[0];
      const y = c.data[1];
      const curve: Curve = [[x, y]];
      curves.push(curve);
    }
    if (c.command === "C") {
      const curve: Curve = curves[curves.length - 1] ?? [];
      curve.push([c.data[0], c.data[1]]);
      curve.push([c.data[2], c.data[3]]);
      curve.push([c.data[4], c.data[5]]);
    }
  });
  return curves;
};
