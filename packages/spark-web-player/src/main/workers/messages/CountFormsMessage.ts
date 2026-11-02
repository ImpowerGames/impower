import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type CountFormsMethod = typeof CountFormsMessage.method;

export interface CountFormsParams {
  keys: string[];
}

export interface CountFormsResult {
  places?: string;
}

export class CountFormsMessage {
  static readonly method = "player/countForms";
  static readonly type = new MessageProtocolRequestType<
    CountFormsMethod,
    CountFormsParams,
    CountFormsResult
  >(CountFormsMessage.method);
}

export namespace CountFormsMessage {
  export interface Request
    extends RequestMessage<CountFormsMethod, CountFormsParams, CountFormsResult> {}
}
