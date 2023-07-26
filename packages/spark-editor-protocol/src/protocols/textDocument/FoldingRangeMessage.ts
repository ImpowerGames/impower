import {
  FoldingRange,
  FoldingRangeParams,
} from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type FoldingRangeMethod = typeof FoldingRangeMessage.method;

export abstract class FoldingRangeMessage {
  static readonly method = "textDocument/foldingRange";
  static readonly type = new MessageProtocolRequestType<
    FoldingRangeMethod,
    FoldingRangeParams,
    FoldingRange[] | null
  >(FoldingRangeMessage.method);
}
