import { ColorInformation, DocumentColorParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DocumentColorMethod = typeof DocumentColorMessage.method;

export class DocumentColorMessage {
  static readonly method = "textDocument/documentColor";
  static readonly type = new MessageProtocolRequestType<
    DocumentColorMethod,
    DocumentColorParams,
    ColorInformation[]
  >(DocumentColorMessage.method);
}
