import { MidiEvent, MidiVoiceEvent } from "../types/MidiEvent";

export const isMidiVoiceEvent = (
  midiEvent: MidiEvent
): midiEvent is MidiVoiceEvent => {
  return (<MidiVoiceEvent>midiEvent).statusChannel !== undefined;
};
