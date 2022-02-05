import { Container } from "../../impower-script-engine";
import { BadTerminationHandler } from "./BadTerminationHandler";
import { GatherPointToResolve } from "./GatherPointToResolve";
import { IObject } from "./IObject";
import { IWeavePoint } from "./IWeavePoint";

export interface IWeave extends IObject {
  rootContainer: Container;
  baseIndentIndex: number;
  looseEnds: IWeavePoint[];
  gatherPointsToResolve: GatherPointToResolve[];
  lastParsedSignificantObject: IObject;
  WeavePointNamed: (name: string) => IWeavePoint;
  ResolveWeavePointNaming: () => void;
  ValidateTermination: (badTerminationHandler: BadTerminationHandler) => void;
}

export const isWeave = (obj: unknown): obj is IWeave => {
  const castObj = obj as IWeave;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.rootContainer !== undefined &&
    castObj.baseIndentIndex !== undefined &&
    castObj.looseEnds !== undefined &&
    castObj.gatherPointsToResolve !== undefined &&
    castObj.lastParsedSignificantObject !== undefined
  );
};
