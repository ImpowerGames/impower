import { Reference } from "../../../core/types/Reference";
import { Inflection } from "./Inflection";
import { Prosody } from "./Prosody";

export interface Character extends Reference<"character"> {
  name: string;
  color: string;
  inflection: Inflection;
  prosody: Prosody;
}
