import { RecursivePartial } from "../../core/types/RecursivePartial";
import { Synth } from "../specs/Synth";

export interface Instrument extends Synth {
  name: string;
}

export interface InstrumentConfig extends RecursivePartial<Instrument> {}
