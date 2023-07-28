import { ColorInformation, DocumentColorParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DocumentColorMethod = typeof DocumentColorMessage.method;

export namespace DocumentColorMessage {
  export const method = "textDocument/documentColor";
  export const type = new MessageProtocolRequestType<
    DocumentColorMethod,
    DocumentColorParams,
    ColorInformation[]
  >(DocumentColorMessage.method);
}
