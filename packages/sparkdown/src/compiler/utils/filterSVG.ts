import { filterSVGAttributes, type AttributeSelection } from "../../attributes";

export const filterSVG = (svg: string, selection: AttributeSelection): string =>
  filterSVGAttributes(svg, selection);
