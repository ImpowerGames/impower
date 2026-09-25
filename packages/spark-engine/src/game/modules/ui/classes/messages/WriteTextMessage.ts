import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { TextInstruction } from "../../../../core/types/Instruction";

export type WriteTextMethod = typeof WriteTextMessage.method;

export interface WriteTextParams {
  target: string;
  instructions: TextInstruction[];
  /** Shows every letter at once. A write that is not instant reveals each
   *  letter at its `after`, and keeps a target with no text on it hidden
   *  until the first letter's reveal begins. */
  instant: boolean;
  /** When the beat this write belongs to starts, on the shared clock
   *  (`sharedNow`, milliseconds). The page shows it that long after the
   *  audio's output latency. Absent for writes that start when the page
   *  handles them. */
  time?: number;
  /** How many leading instructions are text already on the page (a box
   *  carried on after a click): they appear at once, and only the rest are
   *  revealed from `time`. */
  shown?: number;
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
