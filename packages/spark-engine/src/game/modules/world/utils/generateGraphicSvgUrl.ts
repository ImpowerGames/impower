import { Graphic } from "../specs/Graphic";
import { generateGraphicSvg } from "./generateGraphicSvg";

export const generateGraphicSvgUrl = (graphic: Graphic): string => {
  const svg = generateGraphicSvg(graphic);
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
};
