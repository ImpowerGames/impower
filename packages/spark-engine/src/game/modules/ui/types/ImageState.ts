import { ImageEvent } from "../../../core/types/SequenceEvent";

export type ImageState = Omit<ImageEvent, "instance" | "enter" | "exit">;
