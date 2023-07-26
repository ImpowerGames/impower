import {
  ColorInformation,
  DocumentColorParams,
} from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DocumentColorMethod = typeof DocumentColorMessage.method;

export abstract class DocumentColorMessage {
  static readonly method = "textDocument/documentColor";
  static readonly type = new MessageProtocolRequestType<
    DocumentColorMethod,
    DocumentColorParams,
    ColorInformation[]
  >(DocumentColorMessage.method);
}
