import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { ElementContent } from "../../types/ElementContent";

export type UpdateElementMethod = typeof UpdateElementMessage.method;

export interface UpdateElementParams {
  element: string;
  content?: ElementContent;
  style?: Record<string, string | null> | null;
  attributes?: Record<string, string | null> | null;
}

export class UpdateElementMessage {
  static readonly method = "ui/update";
  static readonly type = new MessageProtocolRequestType<
    UpdateElementMethod,
    UpdateElementParams,
    string
  >(UpdateElementMessage.method);
}

export interface UpdateElementMessageMap extends Record<string, [any, any]> {
  [UpdateElementMessage.method]: [
    ReturnType<typeof UpdateElementMessage.type.request>,
    ReturnType<typeof UpdateElementMessage.type.response>
  ];
}
