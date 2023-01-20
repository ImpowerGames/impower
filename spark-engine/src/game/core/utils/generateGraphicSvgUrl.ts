import { Graphic } from "../types/Graphic";
import { generateGraphicSvg } from "./generateGraphicSvg";

export const generateGraphicSvgUrl = (graphic: Graphic): string => {
  return `url('data:image/svg+xml,${encodeURIComponent(
    generateGraphicSvg(graphic)
  )}')`;
};
