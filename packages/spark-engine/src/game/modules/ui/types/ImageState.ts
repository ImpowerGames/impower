import { ImageEvent } from "../../../core/types/SequenceEvent";

export type ImageState = Omit<
  ImageEvent,
  "type" | "instance" | "enter" | "exit"
>;
