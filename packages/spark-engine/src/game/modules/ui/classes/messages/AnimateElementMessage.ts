import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { Animation } from "../../types/Animation";

export type AnimateElementMethod = typeof AnimateElementMessage.method;

export interface AnimateElementParams {
  element: string;
  animations: Animation[];
}

export class AnimateElementMessage {
  static readonly method = "ui/animate";
  static readonly type = new MessageProtocolRequestType<
    AnimateElementMethod,
    AnimateElementParams,
    string
  >(AnimateElementMessage.method);
}

export interface AnimateElementMessageMap extends Record<string, [any, any]> {
  [AnimateElementMessage.method]: [
    ReturnType<typeof AnimateElementMessage.type.request>,
    ReturnType<typeof AnimateElementMessage.type.response>
  ];
}
