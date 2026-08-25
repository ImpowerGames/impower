import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
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
  /**
   * Sibling id to insert this element immediately before (positional create).
   * Omitted/null appends to the end of `parent`. Reactive control-flow regions
   * use it to mount a branch/iteration at the region's slot without a wrapper.
   */
  before?: string | null;
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
    ReturnType<typeof CreateElementMessage.type.response>,
  ];
}
