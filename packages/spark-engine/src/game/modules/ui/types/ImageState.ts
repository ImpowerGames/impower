import { ImageInstruction } from "../../../core/types/Instruction";

export type ImageState = Omit<
  ImageInstruction,
  "type" | "instance" | "enter" | "exit"
>;
