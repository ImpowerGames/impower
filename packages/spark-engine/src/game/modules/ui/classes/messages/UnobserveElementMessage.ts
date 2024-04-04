import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";

export type UnobserveElementMethod = typeof UnobserveElementMessage.method;

export interface UnobserveElementParams {
  element: string;
  event: string;
}

export class UnobserveElementMessage {
  static readonly method = "ui/unobserve";
  static readonly type = new MessageProtocolRequestType<
    UnobserveElementMethod,
    UnobserveElementParams,
    string
  >(UnobserveElementMessage.method);
}

export interface UnobserveElementMessageMap extends Record<string, [any, any]> {
  [UnobserveElementMessage.method]: [
    ReturnType<typeof UnobserveElementMessage.type.request>,
    ReturnType<typeof UnobserveElementMessage.type.response>
  ];
}
