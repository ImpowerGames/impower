import {
  DocumentDiagnosticParams,
  DocumentDiagnosticReport,
} from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DocumentDiagnosticMethod = typeof DocumentDiagnosticMessage.method;

export class DocumentDiagnosticMessage {
  static readonly method = "textDocument/diagnostic";
  static readonly type = new MessageProtocolRequestType<
    DocumentDiagnosticMethod,
    DocumentDiagnosticParams,
    DocumentDiagnosticReport
  >(DocumentDiagnosticMessage.method);
}
