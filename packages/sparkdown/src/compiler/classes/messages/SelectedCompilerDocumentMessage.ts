import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { Range } from "../../types/SparkDiagnostic";
import { SimulationFailure } from "../../types/SimulationFailure";

export type SelectedCompilerDocumentMethod =
  typeof SelectedCompilerDocumentMessage.method;

export interface SelectedCompilerDocumentParams {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
  /** Why no checkpoint could be simulated, when there is none. */
  simulationFailure?: SimulationFailure;
}

export class SelectedCompilerDocumentMessage {
  static readonly method = "compiler/didSelect";
  static readonly type = new MessageProtocolNotificationType<
    SelectedCompilerDocumentMethod,
    SelectedCompilerDocumentParams
  >(SelectedCompilerDocumentMessage.method);
}

export namespace SelectedCompilerDocumentMessage {
  export interface Notification extends NotificationMessage<
    SelectedCompilerDocumentMethod,
    SelectedCompilerDocumentParams
  > {}
}
