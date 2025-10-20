import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";
import { type SparkProgram } from "../../types/SparkProgram";
import { VersionedTextDocumentIdentifier } from "../../types/VersionedTextDocumentIdentifier";

export type CompiledProgramMethod = typeof CompiledProgramMessage.method;

export interface CompiledProgramParams {
  /**
   * The document that was parsed.
   */
  textDocument: VersionedTextDocumentIdentifier;
  /**
   * The parsed program.
   */
  program: SparkProgram;
}

export class CompiledProgramMessage {
  static readonly method = "compiler/didCompile";
  static readonly type = new MessageProtocolNotificationType<
    CompiledProgramMethod,
    CompiledProgramParams
  >(CompiledProgramMessage.method);
}

export namespace CompiledProgramMessage {
  export interface Notification
    extends NotificationMessage<CompiledProgramMethod, CompiledProgramParams> {}
}
