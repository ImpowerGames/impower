import type * as LSP from "../../types";
import { SemanticTokens } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SemanticTokensFullMethod = typeof SemanticTokensFullMessage.method;

export type SemanticTokensParams = LSP.SemanticTokensParams;

export class SemanticTokensFullMessage {
  static readonly method = "textDocument/semanticTokens/full";
  static readonly type = new MessageProtocolRequestType<
    SemanticTokensFullMethod,
    SemanticTokensParams,
    SemanticTokens | null
  >(SemanticTokensFullMessage.method);
}
