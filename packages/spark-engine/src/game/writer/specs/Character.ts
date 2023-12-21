import { Inflection } from "./Inflection";
import { Prosody } from "./Prosody";

export interface Character {
  name: string;
  color: string;
  inflection: Inflection;
  prosody: Prosody;
}
