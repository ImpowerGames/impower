import { TextEvent } from "../../../core/types/SequenceEvent";

export type TextState = Omit<TextEvent, "instance" | "enter" | "exit">;
