import { IContentList } from "./IContentList";
import { Identifier } from "./Identifier";
import { IObject } from "./IObject";

export interface IChoice extends IObject {
  startContent: IContentList;
  choiceOnlyContent: IContentList;
  innerContent: IContentList;
  identifier: Identifier;
  onceOnly: boolean;
  isInvisibleDefault: boolean;
  hasWeaveStyleInlineBrackets: boolean;
  indentationDepth: number;
}

export const isChoice = (obj: unknown): obj is IChoice => {
  const castObj = obj as IChoice;
  if (typeof castObj !== "object") {
    return false;
  }
  return (
    castObj.startContent !== undefined &&
    castObj.choiceOnlyContent !== undefined &&
    castObj.innerContent !== undefined &&
    castObj.identifier !== undefined &&
    castObj.onceOnly !== undefined &&
    castObj.isInvisibleDefault !== undefined &&
    castObj.hasWeaveStyleInlineBrackets !== undefined &&
    castObj.indentationDepth !== undefined
  );
};
