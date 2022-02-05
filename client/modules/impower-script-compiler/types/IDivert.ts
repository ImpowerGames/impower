import { Divert } from "../../impower-script-engine";
import { IExpression } from "./IExpression";
import { IObject } from "./IObject";
import { IPath } from "./IPath";

export interface IDivert extends IObject {
  target: IPath;
  targetContent: IObject;
  arguments: IExpression[];
  runtimeDivert: Divert;
  isFunctionCall: boolean;
  isEmpty: boolean;
  isTunnel: boolean;
  isThread: boolean;
  isEnd: boolean;
  isDone: boolean;
}
