import { ListDefinitionsOrigin } from "../classes/ListDefinitionsOrigin";
import { Path } from "../classes/Path";
import { Pointer } from "../classes/Pointer";
import { SearchResult } from "../classes/SearchResult";
import { IContainer } from "./IContainer";
import { IObject } from "./IObject";

export interface IStory extends IObject {
  currentErrors: string[];
  currentWarnings: string[];
  currentFlowName: string;
  hasError: boolean;
  hasWarning: boolean;
  listDefinitions: ListDefinitionsOrigin;
  rootContentContainer: IContainer;
  mainContentContainer: IContainer;
  Error: (message: string, useEndLineNumber?: boolean) => never;
  PointerAtPath: (path: Path) => Pointer;
  ContentAtPath: (path: Path) => SearchResult;
}

export const isStory = (obj: unknown): obj is IStory => {
  const castObj = obj as IStory;
  if (typeof castObj !== "object") {
    return false;
  }
  if (
    castObj.currentErrors === undefined ||
    castObj.currentWarnings === undefined ||
    castObj.currentFlowName === undefined ||
    castObj.hasError === undefined ||
    castObj.hasWarning === undefined ||
    castObj.listDefinitions === undefined
  ) {
    return false;
  }
  return true;
};
