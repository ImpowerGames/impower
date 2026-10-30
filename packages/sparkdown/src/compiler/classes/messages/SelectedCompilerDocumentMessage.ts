import type { ProgramAddress } from "../../types/ProgramAddress";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { Range } from "../../types/SparkDiagnostic";
import type { SimulationError } from "../../types/SimulationError";
import type { SimulationFailure } from "../../types/SimulationFailure";

export type SelectedCompilerDocumentMethod =
  typeof SelectedCompilerDocumentMessage.method;

export interface SelectedCompilerDocumentParams {
  textDocument: { uri: string };
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
  simulatedAddress?: ProgramAddress | null;
  simulatedProgramId?: string;
  simulationErrors?: SimulationError[];
  programOutdated?: boolean;
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
