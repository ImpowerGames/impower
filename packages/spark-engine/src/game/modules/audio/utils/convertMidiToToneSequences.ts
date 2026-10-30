import { MIDI_CONTROLLER } from "../constants/MIDI_CONTROLLER";
import { MIDI_STATUS_DATA } from "../constants/MIDI_STATUS_DATA";
import {
  MIDI_STATUS_SYSTEM,
  MIDI_STATUS_TYPE,
} from "../constants/MIDI_STATUS_TYPE";
import type { Midi } from "../types/Midi";
import type { Tone } from "../types/Tone";
import type { ToneSequence } from "../types/ToneSequence";
import { convertPitchNumberToHertz } from "./convertPitchNumberToHertz";
import { transpose } from "./transpose";

const normalize = (value: number, min: number, max: number): number => {
  return (value - min) / (max - min);
};

export const convertMidiToToneSequences = (
  midi: Midi,
  sampleRate: number,
): ToneSequence[] => {
  const midiTrackChannels: ToneSequence[] = [];
  midi.tracks.forEach((track) => {
    let absTicks = 0;
    track.forEach((event) => {
      absTicks += event.ticks;
      event.ticks = absTicks;
      if (event.statusType === MIDI_STATUS_TYPE.voice_note_off) {
        event.noteOffVelocity = normalize(event.noteOffVelocity, 0, 127);
      }
      if (event.statusType === MIDI_STATUS_TYPE.voice_note_on) {
        event.noteOnVelocity = normalize(event.noteOnVelocity, 0, 127);
      }
      if (event.statusType === MIDI_STATUS_TYPE.voice_pitch_bend) {
        event.pitchBend = normalize(event.pitchBend, 8192, 8192 * 2) * 2;
      }
      if (event.statusType === MIDI_STATUS_TYPE.voice_controller_change) {
        if (
          event.controllerNumber === MIDI_CONTROLLER.sustain_pedal ||
          event.controllerNumber === MIDI_CONTROLLER.portamento_pedal ||
          event.controllerNumber === MIDI_CONTROLLER.sostenuto_pedal ||
          event.controllerNumber === MIDI_CONTROLLER.soft_pedal ||
          event.controllerNumber === MIDI_CONTROLLER.legato_pedal ||
          event.controllerNumber === MIDI_CONTROLLER.hold_pedal
        ) {
          event.controllerValue = event.controllerValue <= 63 ? 0 : 1;
        } else if (event.controllerNumber === MIDI_CONTROLLER.local_keyboard) {
          event.controllerValue = event.controllerValue === 0 ? 0 : 1;
        } else if (event.controllerNumber === MIDI_CONTROLLER.mono_operation) {
          event.controllerValue = event.controllerValue;
        } else {
          event.controllerValue = normalize(event.controllerValue, 0, 127);
        }
      }
    });
  });

  midi.tracks.forEach((track, trackIndex) => {
    const conductorTrack =
      midi.format === 1 && midi.tracks[0] ? midi.tracks[0] : [];
    if (conductorTrack.length > 0 && trackIndex === 0) {
      return;
    }
    const midiChannels: Map<number, ToneSequence> = new Map();
    const sortedEvents = [...conductorTrack, ...track].sort(
      (a, b) => a.ticks - b.ticks,
    );
    let mpq = 0;
    let instruments: number[] = [];
    let pitchBends: number[] = [];
    sortedEvents.forEach((event) => {
      const ticks = event.ticks ?? 0;
      if (
        event.statusType === MIDI_STATUS_SYSTEM.system_meta &&
        event.statusData === MIDI_STATUS_DATA.system_meta_tempo
      ) {
        mpq = event.tempoMPQ;
      }
      const secondsPerQuarterNote = mpq / 1000000;
      const quarterNotes = ticks / midi.tpq;
      const time = quarterNotes * secondsPerQuarterNote;
      if (event.statusType === MIDI_STATUS_TYPE.voice_controller_change) {
        const channelNumber = event.statusChannel;
        const midiChannel: ToneSequence = midiChannels.get(channelNumber) || {
          tones: [],
          events: [],
          sampleRate,
        };
        const type = event.controllerNumber;
        const value = event.controllerValue;
        const controllerEvent = { time, duration: 0, type, value };
        const prevControllerIndex = midiChannel.events
          .map((event) => event.type)
          .lastIndexOf(type);
        const prevControllerEvent = midiChannel.events[prevControllerIndex];
        if (prevControllerEvent) {
          prevControllerEvent.duration = time - (controllerEvent.time ?? 0);
        }
        midiChannel.events.push(controllerEvent);
        midiChannels.set(channelNumber, midiChannel);
      }
      if (event.statusType === MIDI_STATUS_TYPE.voice_program_change) {
        const instrumentNumber = event.programNumber;
        const channelNumber = event.statusChannel;
        instruments[channelNumber] = instrumentNumber;
      }
      if (event.statusType === MIDI_STATUS_TYPE.voice_pitch_bend) {
        const channelNumber = event.statusChannel;
        const pitchBend = event.pitchBend;
        pitchBends[channelNumber] = pitchBend;
      }
      if (event.statusType === MIDI_STATUS_TYPE.voice_note_off) {
        const channelNumber = event.statusChannel;
        const noteNumber = event.noteOffNumber;
        const midiChannel = midiChannels.get(channelNumber) || {
          tones: [],
          events: [],
        };
        const noteOnIndex = midiChannel.tones
          .map((tone) => tone.note)
          .lastIndexOf(noteNumber);
        const tone = midiChannel.tones[noteOnIndex];
        if (tone) {
          tone.duration = time - (tone.time ?? 0);
        }
      }
      if (event.statusType === MIDI_STATUS_TYPE.voice_note_on) {
        const channelNumber = event.statusChannel;
        const noteNumber = event.noteOnNumber;
        const noteVelocity = event.noteOnVelocity;
        const midiChannel: ToneSequence = midiChannels.get(channelNumber) || {
          tones: [],
          events: [],
          sampleRate,
        };
        const instrumentNumber = instruments[channelNumber] ?? 0;
        const pitchBend = pitchBends[channelNumber] ?? 0;
        const pitchHertz = transpose(
          convertPitchNumberToHertz(noteNumber),
          pitchBend,
        );
        const mono = channelNumber === 9;
        const tone: Tone = {
          time: time,
          note: noteNumber,
          pitch: pitchHertz,
          velocity: noteVelocity,
          instrument: instrumentNumber,
          mono,
        };
        midiChannel.tones.push(tone);
        midiChannels.set(channelNumber, midiChannel);
      }
    });
    midiTrackChannels.push(...midiChannels.values());
  });

  return midiTrackChannels;
};
