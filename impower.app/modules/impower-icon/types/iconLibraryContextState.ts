import { Dispatch } from "react";
import { IconLibrary } from "./iconLibrary";
import { IconLibraryAction } from "./iconLibraryActions";

export type IconLibraryContextState = [
  IconLibrary,
  Dispatch<IconLibraryAction>
];

export const createIconLibraryContextState = (): IconLibraryContextState => [
  {},
  (): void => null,
];
