import { ICON_LIBRARY_REGISTER } from "./actions/iconLibraryRegisterAction";
import { IconLibrary } from "./iconLibrary";
import { IconLibraryAction } from "./iconLibraryActions";

export const iconLibraryReducer = (
  state: IconLibrary,
  action: IconLibraryAction
): IconLibrary => {
  switch (action.type) {
    case ICON_LIBRARY_REGISTER: {
      const { variant, icons } = action.payload;
      const newState = {
        ...(state || {}),
        [variant]: {
          ...(state?.[variant] || {}),
        },
      };
      if (icons) {
        Object.entries(icons).forEach(([name, data]) => {
          newState[variant][name] = data;
        });
      }
      return JSON.stringify(newState) === JSON.stringify(state)
        ? state
        : newState;
    }
    default:
      throw new Error(`Icon Library Action not recognized: ${action}`);
  }
};
