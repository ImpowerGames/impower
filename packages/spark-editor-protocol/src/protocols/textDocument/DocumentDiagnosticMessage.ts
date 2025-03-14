import type * as LSP from "../../types";
import { DocumentDiagnosticReport } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DocumentDiagnosticMethod = typeof DocumentDiagnosticMessage.method;

export type DocumentDiagnosticParams = LSP.DocumentDiagnosticParams;

export class DocumentDiagnosticMessage {
  static readonly method = "textDocument/diagnostic";
  static readonly type = new MessageProtocolRequestType<
    DocumentDiagnosticMethod,
    DocumentDiagnosticParams,
    DocumentDiagnosticReport
  >(DocumentDiagnosticMessage.method);
}
