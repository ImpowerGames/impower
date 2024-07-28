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
  auto?: boolean;
  end: number;
  checkpoint?: string;
}
