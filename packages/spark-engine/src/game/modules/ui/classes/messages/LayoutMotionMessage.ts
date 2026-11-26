import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

export type LayoutMotionMethod = typeof LayoutMotionMessage.method;

export interface LayoutMotionParams {
  settle?: boolean;
}

export class LayoutMotionMessage {
  static readonly method = "ui/layout";
  static readonly type = new MessageProtocolRequestType<
    LayoutMotionMethod,
    LayoutMotionParams,
    string[]
  >(LayoutMotionMessage.method);
}

export interface LayoutMotionMessageMap extends Record<string, [any, any]> {
  [LayoutMotionMessage.method]: [
    ReturnType<typeof LayoutMotionMessage.type.request>,
    ReturnType<typeof LayoutMotionMessage.type.response>,
  ];
}
