import { SvgData } from "../interfaces/svgData";

export const ICON_LIBRARY_REGISTER = "impower/icon/LIBRARY_REGISTER";
export interface IconLibraryRegisterAction {
  type: typeof ICON_LIBRARY_REGISTER;
  payload: {
    variant: string;
    icons: { [name: string]: SvgData };
  };
}
