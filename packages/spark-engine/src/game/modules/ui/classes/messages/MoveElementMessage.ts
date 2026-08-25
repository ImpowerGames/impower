import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

export type MoveElementMethod = typeof MoveElementMessage.method;

export interface MoveElementParams {
  /** The element to move among its current siblings. */
  element: string;
  /** Insert `element` immediately before this sibling; `null` → append to the
   *  end of the parent's children. Used by keyed `for` reconciliation to move a
   *  retained item's subtree into its new position instead of rebuilding it. */
  before: string | null;
}

export class MoveElementMessage {
  static readonly method = "ui/move";
  static readonly type = new MessageProtocolRequestType<
    MoveElementMethod,
    MoveElementParams,
    string
  >(MoveElementMessage.method);
}

export interface MoveElementMessageMap extends Record<string, [any, any]> {
  [MoveElementMessage.method]: [
    ReturnType<typeof MoveElementMessage.type.request>,
    ReturnType<typeof MoveElementMessage.type.response>,
  ];
}
