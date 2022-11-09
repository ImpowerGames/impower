import { EnvelopeOptions } from "./EnvelopeOptions";
import { OscillatorOptions } from "./OscillatorOptions";

export interface InstrumentConfig {
  envelope?: EnvelopeOptions;
  oscillator?: OscillatorOptions;
}
