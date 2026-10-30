import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type ProgramHeldMethod = typeof ProgramHeldMessage.method;

export interface ProgramHeldParams {
  program: string;
}

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
