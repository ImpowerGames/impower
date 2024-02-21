import { IElementEvent } from "./IElementEvent";

export interface IFocusEvent<T extends string> extends IElementEvent<T> {
  relatedTargetId: string | null;
}
