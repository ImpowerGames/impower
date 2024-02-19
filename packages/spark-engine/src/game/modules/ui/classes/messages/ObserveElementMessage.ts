import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";

export type ObserveElementMethod = typeof ObserveElementMessage.method;

export interface ObserveElementParams {
  id: string;
  event: string;
  stopPropagation: boolean;
  once: boolean;
}

export class ObserveElementMessage {
  static readonly method = "ui/observe";
  static readonly type = new MessageProtocolRequestType<
    ObserveElementMethod,
    ObserveElementParams,
    string
  >(ObserveElementMessage.method);
}

export interface ObserveElementMessageMap extends Record<string, [any, any]> {
  [ObserveElementMessage.method]: [
    ReturnType<typeof ObserveElementMessage.type.request>,
    ReturnType<typeof ObserveElementMessage.type.response>
  ];
}
