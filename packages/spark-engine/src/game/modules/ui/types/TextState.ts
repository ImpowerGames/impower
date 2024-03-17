import { TextEvent } from "../../../core/types/SequenceEvent";

export type TextState = Omit<TextEvent, "type" | "instance" | "enter" | "exit">;
