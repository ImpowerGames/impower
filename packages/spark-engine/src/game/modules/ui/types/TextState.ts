import { TextInstruction } from "../../../core/types/Instruction";

export type TextState = Omit<
  TextInstruction,
  "type" | "instance" | "enter" | "exit"
>;
