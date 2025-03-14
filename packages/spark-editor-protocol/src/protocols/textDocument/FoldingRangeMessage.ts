import type * as LSP from "../../types";
import { FoldingRange } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type FoldingRangeMethod = typeof FoldingRangeMessage.method;

export type FoldingRangeParams = LSP.FoldingRangeParams;

export class FoldingRangeMessage {
  static readonly method = "textDocument/foldingRange";
  static readonly type = new MessageProtocolRequestType<
    FoldingRangeMethod,
    FoldingRangeParams,
    FoldingRange[] | null
  >(FoldingRangeMessage.method);
}
