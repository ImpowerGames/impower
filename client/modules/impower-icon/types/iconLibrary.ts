import { SvgData } from "./interfaces/svgData";

export type IconLibrary = {
  [variant: string]: { [name: string]: SvgData };
};
