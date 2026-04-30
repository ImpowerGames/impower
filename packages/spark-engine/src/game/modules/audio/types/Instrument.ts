import { type RecursivePartial } from "../../../core/types/RecursivePartial";
import { type Synth } from "./Synth";

export interface Instrument extends Synth {
  name: string;
}

export interface InstrumentConfig extends RecursivePartial<Instrument> {}
