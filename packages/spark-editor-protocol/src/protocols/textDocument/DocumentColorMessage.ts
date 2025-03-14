import type * as LSP from "../../types";
import { ColorInformation } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DocumentColorMethod = typeof DocumentColorMessage.method;

export type DocumentColorParams = LSP.DocumentColorParams;

export class DocumentColorMessage {
  static readonly method = "textDocument/documentColor";
  static readonly type = new MessageProtocolRequestType<
    DocumentColorMethod,
    DocumentColorParams,
    ColorInformation[]
  >(DocumentColorMessage.method);
}
