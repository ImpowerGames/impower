import { SoundSource } from "./SoundSource";

export interface Sound {
  id: string;
  src: SoundSource;
  cues?: number[];
  loop?: boolean;
  volume?: number;
  muted?: boolean;
  attack?: number;
  release?: number;
}
