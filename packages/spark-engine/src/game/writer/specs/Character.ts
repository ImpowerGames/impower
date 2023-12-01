import { SynthConfig } from "../../sound";
import { Inflection } from "./Inflection";
import { Prosody } from "./Prosody";

export interface Character {
  name: string;
  image: string;
  color: string;
  inflection: Inflection;
  prosody: Prosody;
  synth: SynthConfig;
}
