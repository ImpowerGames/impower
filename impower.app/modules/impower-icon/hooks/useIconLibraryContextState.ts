import { useReducer } from "react";
import { IconLibraryContextState } from "../types/iconLibraryContextState";
import { iconLibraryReducer } from "../types/iconLibraryReducer";

export const useIconLibraryContextState = (): IconLibraryContextState => {
  return useReducer(iconLibraryReducer, {});
};
