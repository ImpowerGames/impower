import { Argument } from "../types/Argument";
import { Identifier } from "../types/Identifier";

export interface FlowDecl {
  name: Identifier;
  arguments: Argument[];
  isFunction: boolean;
}
