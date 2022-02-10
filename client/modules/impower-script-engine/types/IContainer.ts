import { Path } from "../classes/Path";
import { SearchResult } from "../classes/SearchResult";
import { StringBuilder } from "../classes/StringBuilder";
import { INamedContent, isNamedContent } from "./INamedContent";
import { IObject } from "./IObject";

export interface IContainer extends IObject, INamedContent {
  namedContent: Record<string, INamedContent>;
  visitsShouldBeCounted: boolean;
  turnIndexShouldBeCounted: boolean;
  countingAtStartOnly: boolean;
  namedOnlyContent: Record<string, IObject>;
  content: IObject[];
  countFlags: number;
  BuildStringOfHierarchy: (
    sb?: StringBuilder,
    indentation?: number,
    pointedObj?: IObject
  ) => string;
  ContentAtPath: (path: Path) => SearchResult;
}

export const isContainer = (obj: unknown): obj is IContainer => {
  const castObj = obj as IContainer;
  if (!castObj) {
    return false;
  }
  if (
    !isNamedContent(obj) ||
    castObj.visitsShouldBeCounted === undefined ||
    castObj.turnIndexShouldBeCounted === undefined ||
    castObj.countingAtStartOnly === undefined
  ) {
    return false;
  }
  return true;
};
