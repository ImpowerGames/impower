import React from "react";
import {
  createIconLibraryContextState,
  IconLibraryContextState,
} from "../types/iconLibraryContextState";

export const IconLibraryContext = React.createContext<IconLibraryContextState>(
  createIconLibraryContextState()
);
