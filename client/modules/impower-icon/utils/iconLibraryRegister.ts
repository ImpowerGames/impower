import {
  IconLibraryRegisterAction,
  ICON_LIBRARY_REGISTER,
} from "../types/actions/iconLibraryRegisterAction";
import { SvgData } from "../types/interfaces/svgData";

const iconLibraryRegister = (
  variant: string,
  icons: { [name: string]: SvgData }
): IconLibraryRegisterAction => {
  return {
    type: ICON_LIBRARY_REGISTER,
    payload: {
      variant,
      icons,
    },
  };
};

export default iconLibraryRegister;
