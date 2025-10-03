import { MessageProtocolRequestType } from "../../../../../protocol/classes/MessageProtocolRequestType";
import { ElementContent } from "../../types/ElementContent";

export type CreateElementMethod = typeof CreateElementMessage.method;

export interface CreateElementParams {
  parent: string | null;
  element: string;
  type: string;
  name: string;
  content?: ElementContent;
  style?: Record<string, string | number | null> | null;
  attributes?: Record<string, string | null> | null;
  breakpoints?: Record<string, number>;
}

export class CreateElementMessage {
  static readonly method = "ui/create";
  static readonly type = new MessageProtocolRequestType<
    CreateElementMethod,
    CreateElementParams,
    string
  >(CreateElementMessage.method);
}

export interface CreateElementMessageMap extends Record<string, [any, any]> {
  [CreateElementMessage.method]: [
    ReturnType<typeof CreateElementMessage.type.request>,
    ReturnType<typeof CreateElementMessage.type.response>
  ];
}
