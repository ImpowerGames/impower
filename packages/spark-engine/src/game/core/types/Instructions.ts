import {
  AudioInstruction,
  ImageInstruction,
  TextInstruction,
} from "./Instruction";

export interface Instructions {
  text?: Record<string, TextInstruction[]>;
  image?: Record<string, ImageInstruction[]>;
  audio?: Record<string, AudioInstruction[]>;
  choices?: string[];
  uuids?: string[];
  auto?: boolean;
  end: number;
}
