import { MIDI_PERCUSSION_INSTRUMENTS } from "../constants/MIDI_PERCUSSION_INSTRUMENTS";

export type MidiPercussionInstrumentType =
  keyof typeof MIDI_PERCUSSION_INSTRUMENTS;
