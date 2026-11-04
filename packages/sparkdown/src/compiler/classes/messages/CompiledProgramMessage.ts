import type { ProgramAddress } from "../../types/ProgramAddress";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { type SparkProgram } from "../../types/SparkProgram";
import type { SimulationError } from "../../types/SimulationError";
import type { SimulationFailure } from "../../types/SimulationFailure";
import type { VersionedTextDocumentIdentifier } from "../../types/VersionedTextDocumentIdentifier";

export type CompiledProgramMethod = typeof CompiledProgramMessage.method;

export interface CompiledProgramParams {
  textDocument: VersionedTextDocumentIdentifier;
  program: SparkProgram;
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
  simulatedAddress?: ProgramAddress | null;
  simulatedProgramId?: string;
  simulationErrors?: SimulationError[];
}

export class CompiledProgramMessage {
  static readonly method = "compiler/didCompile";
  static readonly type = new MessageProtocolNotificationType<
    CompiledProgramMethod,
    CompiledProgramParams
  >(CompiledProgramMessage.method);
}

export namespace CompiledProgramMessage {
  export interface Notification extends NotificationMessage<
    CompiledProgramMethod,
    CompiledProgramParams
  > {}
}
