import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { TextInstruction } from "../../../../core/types/Instruction";

export type WriteTextMethod = typeof WriteTextMessage.method;

export interface WriteTextParams {
  target: string;
  instructions: TextInstruction[];
  instant: boolean;
  /** When the beat this write belongs to starts, on the shared clock
   *  (`sharedNow`, milliseconds). The page shows it that long after the
   *  audio's output latency. Absent for writes that start when the page
   *  handles them. */
  time?: number;
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
