import { Timbre } from "./Timbre";
import { Tuple } from "./Tuple";

export interface GeneralMidiTimbres {
  program: Tuple<Timbre[], 129>;
  percussion: Tuple<Timbre[], 82>;
}
