import { INamedContent } from "./INamedContent";

export interface IContainer extends INamedContent {
  namedContent: Record<string, INamedContent>;
  visitsShouldBeCounted: boolean;
  turnIndexShouldBeCounted: boolean;
  countingAtStartOnly: boolean;
}
