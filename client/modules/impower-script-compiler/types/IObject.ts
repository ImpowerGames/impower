import {
  Container,
  DebugMetadata,
  Path,
  RuntimeObject,
} from "../../impower-script-engine";
import { FindQueryFunc } from "./FindQueryFunc";

export interface IObject {
  parent: IObject;
  content: IObject[];
  containerForCounting: Container;
  runtimePath: Path;
  debugMetadata: DebugMetadata;
  typeName: string;
  ancestry: IObject[];
  runtimeObject: RuntimeObject;
  alreadyHadError: boolean;
  alreadyHadWarning: boolean;
  Equals: (obj: unknown) => boolean;
  ToString: () => string;
  Error: (message: string, source?: IObject, isWarning?: boolean) => void;
  ClosestFlowBase: () => IObject;
  GenerateRuntimeObject: () => RuntimeObject;
  Find: <T extends IObject>(queryFunc?: FindQueryFunc<T>) => T;
  FindAll: <T>(queryFunc?: FindQueryFunc<T>, foundSoFar?: T[]) => T[];
  ResolveReferences: (context: IObject) => void;
}

export const isObject = (obj: unknown): obj is IObject => {
  const castObj = obj as IObject;
  if (typeof castObj !== "object") {
    return false;
  }
  return castObj.parent !== undefined && castObj.content !== undefined;
};
