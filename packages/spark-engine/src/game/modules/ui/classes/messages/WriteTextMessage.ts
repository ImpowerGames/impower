import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { TextInstruction } from "../../../../core/types/Instruction";

export type WriteTextMethod = typeof WriteTextMessage.method;

export interface WriteTextParams {
  target: string;
  instructions: TextInstruction[];
  instant: boolean;
}

export class WriteTextMessage {
  static readonly method = "ui/write-text";
  static readonly type = new MessageProtocolRequestType<
    WriteTextMethod,
    WriteTextParams,
    string
  >(WriteTextMessage.method);
}

export interface WriteTextMessageMap extends Record<string, [any, any]> {
  [WriteTextMessage.method]: [
    ReturnType<typeof WriteTextMessage.type.request>,
    ReturnType<typeof WriteTextMessage.type.response>,
  ];
}
