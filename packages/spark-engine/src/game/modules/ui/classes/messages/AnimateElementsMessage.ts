import { MessageProtocolRequestType } from "../../../../../protocol/classes/MessageProtocolRequestType";
import { Animation } from "../../types/Animation";

export type AnimateElementsMethod = typeof AnimateElementsMessage.method;

export interface AnimateElementsParams {
  effects: {
    element: string;
    animations: Animation[];
  }[];
}

export class AnimateElementsMessage {
  static readonly method = "ui/animate";
  static readonly type = new MessageProtocolRequestType<
    AnimateElementsMethod,
    AnimateElementsParams,
    number[]
  >(AnimateElementsMessage.method);
}

export interface AnimateElementsMessageMap extends Record<string, [any, any]> {
  [AnimateElementsMessage.method]: [
    ReturnType<typeof AnimateElementsMessage.type.request>,
    ReturnType<typeof AnimateElementsMessage.type.response>
  ];
}
