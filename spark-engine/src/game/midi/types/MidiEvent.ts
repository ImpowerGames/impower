export type MidiEvent =
  | MidiVoiceEvent
  | MidiSystemExclusiveEvent
  | MidiSystemMetaEvent;

export type MidiStatusVoiceType =
  | 0x08
  | 0x09
  | 0x0a
  | 0x0b
  | 0x0c
  | 0x0d
  | 0x0e;

export type MidiStatusSystemExclusiveType = 0xf0;

export type MidiStatusSystemMetaType = 0xff;

export type MidiStatusChannel =
  | 0x00
  | 0x01
  | 0x02
  | 0x03
  | 0x04
  | 0x05
  | 0x06
  | 0x07
  | 0x08
  | 0x09
  | 0x0a
  | 0x0b
  | 0x0c
  | 0x0d
  | 0x0e
  | 0x0f;

export type MidiStatusData =
  | 0x01
  | 0x02
  | 0x03
  | 0x04
  | 0x05
  | 0x06
  | 0x07
  | 0x08
  | 0x09
  | 0x0a
  | 0x0b
  | 0x0c
  | 0x0d
  | 0x0e
  | 0x0f
  | 0x20
  | 0x21
  | 0x2f
  | 0x51
  | 0x54
  | 0x58
  | 0x59
  | 0x7f;

export interface IMidiEvent {
  ticks?: number;
  statusType: number;
}

export interface IMidiVoiceEvent extends IMidiEvent {
  statusType: MidiStatusVoiceType;
  statusChannel: MidiStatusChannel;
}

export interface IMidiSystemExclusiveEvent extends IMidiEvent {
  statusType: MidiStatusSystemExclusiveType;
  statusData: string;
}

export interface IMidiSystemMetaEvent extends IMidiEvent {
  statusType: MidiStatusSystemMetaType;
  statusData: MidiStatusData;
}

export interface IMidiSystemMetaProgramNameEvent extends IMidiSystemMetaEvent {
  programName: string;
}

export interface IMidiSystemMetaChannelPrefixEvent
  extends IMidiSystemMetaEvent {
  channelPrefix: number;
}

export interface IMidiSystemMetaSequencerSpecificEvent
  extends IMidiSystemMetaEvent {
  sequencerSpecificData: string;
}

export interface IMidiSystemMetaCopyrightEvent extends IMidiSystemMetaEvent {
  copyrightNotice: string;
}

export interface IMidiSystemMetaCueEvent extends IMidiSystemMetaEvent {
  cuePoint: string;
}

export interface IMidiSystemMetaDeviceNameEvent extends IMidiSystemMetaEvent {
  deviceName: string;
}

export interface IMidiSystemMetaTrackEndEvent extends IMidiSystemMetaEvent {
  endOfTrack: boolean;
}

export interface IMidiSystemMetaInstrumentNameEvent
  extends IMidiSystemMetaEvent {
  instrumentName: string;
}

export interface IMidiSystemMetaLyricEvent extends IMidiSystemMetaEvent {
  lyric: string;
}

export interface IMidiSystemMetaMarkerEvent extends IMidiSystemMetaEvent {
  marker: string;
}

export interface IMidiSystemMetaPortEvent extends IMidiSystemMetaEvent {
  midiPort: number;
}

export interface IMidiSystemMetaTrackNameEvent extends IMidiSystemMetaEvent {
  trackName: string;
}

export interface IMidiSystemMetaTextEvent extends IMidiSystemMetaEvent {
  text: string;
}

export interface IMidiSystemMetaKeySignatureEvent extends IMidiSystemMetaEvent {
  keySignature: {
    key: number;
    scale: number;
  };
}

export interface IMidiSystemMetaTimeSignatureEvent
  extends IMidiSystemMetaEvent {
  timeSignature: {
    denominator: number;
    metronome: number;
    numerator: number;
    thirtyseconds: number;
  };
}

export interface IMidiSystemMetaTempoEvent extends IMidiSystemMetaEvent {
  tempo: {
    mpq: number;
  };
}

export interface IMidiSystemMetaSmpteOffsetEvent extends IMidiSystemMetaEvent {
  smpteOffset: {
    frame: number;
    frameRate: number;
    hour: number;
    minutes: number;
    seconds: number;
    subFrame: number;
  };
}

export interface IMidiVoiceNoteOffEvent extends IMidiVoiceEvent {
  noteOff: {
    noteNumber: number;
    velocity: number;
  };
}

export interface IMidiVoiceNoteOnEvent extends IMidiVoiceEvent {
  noteOn: {
    noteNumber: number;
    velocity: number;
  };
}

export interface IMidiVoicePolyphonicEvent extends IMidiVoiceEvent {
  keyPressure: {
    noteNumber: number;
    pressure: number;
  };
}

export interface IMidiVoicePressureEvent extends IMidiVoiceEvent {
  channelPressure: {
    pressure: number;
  };
}

export interface IMidiVoiceControlEvent extends IMidiVoiceEvent {
  controlChange: {
    controller: number;
    value: number;
  };
}

export interface IMidiVoiceProgramEvent extends IMidiVoiceEvent {
  programChange: {
    programNumber: number;
  };
}

export interface IMidiVoicePitchBendEvent extends IMidiVoiceEvent {
  pitchBend: number;
}

export type MidiVoiceEvent =
  | IMidiVoicePressureEvent
  | IMidiVoiceControlEvent
  | IMidiVoicePolyphonicEvent
  | IMidiVoiceNoteOffEvent
  | IMidiVoiceNoteOnEvent
  | IMidiVoicePitchBendEvent
  | IMidiVoiceProgramEvent;

export type MidiSystemExclusiveEvent = IMidiSystemExclusiveEvent;

export type MidiSystemMetaEvent =
  | IMidiSystemMetaChannelPrefixEvent
  | IMidiSystemMetaCopyrightEvent
  | IMidiSystemMetaCueEvent
  | IMidiSystemMetaDeviceNameEvent
  | IMidiSystemMetaTrackEndEvent
  | IMidiSystemMetaInstrumentNameEvent
  | IMidiSystemMetaKeySignatureEvent
  | IMidiSystemMetaLyricEvent
  | IMidiSystemMetaMarkerEvent
  | IMidiSystemMetaPortEvent
  | IMidiSystemMetaProgramNameEvent
  | IMidiSystemMetaSequencerSpecificEvent
  | IMidiSystemMetaTempoEvent
  | IMidiSystemMetaSmpteOffsetEvent
  | IMidiSystemMetaTextEvent
  | IMidiSystemMetaTimeSignatureEvent
  | IMidiSystemMetaTrackNameEvent;
