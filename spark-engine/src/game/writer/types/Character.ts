import { SoundConfig } from "../../synth";
import { Intonation } from "./Intonation";
import { Prosody } from "./Prosody";

export interface Character {
  name: string;
  image: string;
  color: string;
  intonation: Intonation;
  prosody: Prosody;
  voiceSound: SoundConfig;
}
