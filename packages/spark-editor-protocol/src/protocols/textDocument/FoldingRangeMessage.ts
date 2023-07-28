import { FoldingRange, FoldingRangeParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type FoldingRangeMethod = typeof FoldingRangeMessage.method;

export namespace FoldingRangeMessage {
  export const method = "textDocument/foldingRange";
  export const type = new MessageProtocolRequestType<
    FoldingRangeMethod,
    FoldingRangeParams,
    FoldingRange[] | null
  >(FoldingRangeMessage.method);
}
