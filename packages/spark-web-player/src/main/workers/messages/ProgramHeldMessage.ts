import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type ProgramHeldMethod = typeof ProgramHeldMessage.method;

export interface ProgramHeldParams {
  /** The real program the page took, by `programIdentity`. */
  program: string;
}

/**
 * The page took the summary of a real program: it can name that program, and
 * each real program compiled after it, and never again one compiled before
 * it. Answered once the worker has let go of the stories it kept only for
 * those.
 */
export class ProgramHeldMessage {
  static readonly method = "player/programHeld";
  static readonly type = new MessageProtocolRequestType<
    ProgramHeldMethod,
    ProgramHeldParams,
    {}
  >(ProgramHeldMessage.method);
}

export namespace ProgramHeldMessage {
  export interface Request extends RequestMessage<
    ProgramHeldMethod,
    ProgramHeldParams,
    {}
  > {}
}
