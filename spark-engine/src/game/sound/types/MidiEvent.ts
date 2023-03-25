export type MidiStatusVoiceType =
  | 0x08
  | 0x09
  | 0x0a
  | 0x0b
  | 0x0c
  | 0x0d
  | 0x0e;

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

export interface IMidiEvent {
  ticks: number;
  statusType: number;
}

export interface IMidiVoiceEvent extends IMidiEvent {
  statusType: MidiStatusVoiceType;
  statusChannel: MidiStatusChannel;
}

export interface MidiVoiceNoteOffEvent extends IMidiVoiceEvent {
  statusType: 0x08;
  noteOffNumber: number;
  noteOffVelocity: number;
}

export interface MidiVoiceNoteOnEvent extends IMidiVoiceEvent {
  statusType: 0x09;
  noteOnNumber: number;
  noteOnVelocity: number;
}

export interface MidiVoiceKeyPressureEvent extends IMidiVoiceEvent {
  statusType: 0x0a;
  keyPressureNote: number;
  keyPressureValue: number;
}

export interface MidiVoiceControllerChangeEvent extends IMidiVoiceEvent {
  statusType: 0x0b;
  controllerNumber: number;
  controllerValue: number;
}

export interface MidiVoiceProgramChangeEvent extends IMidiVoiceEvent {
  statusType: 0x0c;
  programNumber: number;
}

export interface MidiVoiceChannelPressureEvent extends IMidiVoiceEvent {
  statusType: 0x0d;
  channelPressure: number;
}

export interface MidiVoicePitchBendEvent extends IMidiVoiceEvent {
  statusType: 0x0e;
  pitchBend: number;
}

export interface MidiSystemExclusiveEvent extends IMidiEvent {
  statusType: 0xf0;
  statusData: string;
}

export interface IMidiSystemMetaEvent extends IMidiEvent {
  statusType: 0xff;
  statusData:
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
}

export interface MidiSystemMetaTextEvent extends IMidiSystemMetaEvent {
  statusData: 0x01 | 0x0a | 0x0b | 0x0c | 0x0d | 0x0e | 0x0f;
  text: string;
}

export interface MidiSystemMetaCopyrightEvent extends IMidiSystemMetaEvent {
  statusData: 0x02;
  copyrightNotice: string;
}

export interface MidiSystemMetaTrackNameEvent extends IMidiSystemMetaEvent {
  statusData: 0x03;
  trackName: string;
}

export interface MidiSystemMetaInstrumentNameEvent
  extends IMidiSystemMetaEvent {
  statusData: 0x04;
  instrumentName: string;
}

export interface MidiSystemMetaLyricEvent extends IMidiSystemMetaEvent {
  statusData: 0x05;
  lyric: string;
}

export interface MidiSystemMetaMarkerEvent extends IMidiSystemMetaEvent {
  statusData: 0x06;
  marker: string;
}

export interface MidiSystemMetaCueEvent extends IMidiSystemMetaEvent {
  statusData: 0x07;
  cuePoint: string;
}

export interface MidiSystemMetaProgramNameEvent extends IMidiSystemMetaEvent {
  statusData: 0x08;
  programName: string;
}

export interface MidiSystemMetaDeviceNameEvent extends IMidiSystemMetaEvent {
  statusData: 0x09;
  deviceName: string;
}

export interface MidiSystemMetaPortEvent extends IMidiSystemMetaEvent {
  statusData: 0x21;
  midiPort: number;
}

export interface MidiSystemMetaChannelPrefixEvent extends IMidiSystemMetaEvent {
  statusData: 0x20;
  channelPrefix: number;
}

export interface MidiSystemMetaTrackEndEvent extends IMidiSystemMetaEvent {
  statusData: 0x2f;
  endOfTrack: boolean;
}

export interface MidiSystemMetaTempoEvent extends IMidiSystemMetaEvent {
  statusData: 0x51;
  tempoMPQ: number;
}

export interface MidiSystemMetaSmpteOffsetEvent extends IMidiSystemMetaEvent {
  statusData: 0x54;
  smpteFrame: number;
  smpteFrameRate: number;
  smpteHour: number;
  smpteMinutes: number;
  smpteSeconds: number;
  smpteSubFrame: number;
}

export interface MidiSystemMetaTimeSignatureEvent extends IMidiSystemMetaEvent {
  statusData: 0x58;
  timeSignatureNumerator: number;
  timeSignatureDenominator: number;
  timeSignatureClicks: number;
  timeSignatureResolution: number;
}

export interface MidiSystemMetaKeySignatureEvent extends IMidiSystemMetaEvent {
  statusData: 0x59;
  keySignatureNote: number;
  keySignatureScale: number;
}

export interface MidiSystemMetaSequencerSpecificEvent
  extends IMidiSystemMetaEvent {
  statusData: 0x7f;
  sequencerSpecificData: string;
}

export type MidiVoiceEvent =
  | MidiVoiceChannelPressureEvent
  | MidiVoiceControllerChangeEvent
  | MidiVoiceKeyPressureEvent
  | MidiVoiceNoteOffEvent
  | MidiVoiceNoteOnEvent
  | MidiVoicePitchBendEvent
  | MidiVoiceProgramChangeEvent;

export type MidiSystemMetaEvent =
  | MidiSystemMetaChannelPrefixEvent
  | MidiSystemMetaCopyrightEvent
  | MidiSystemMetaCueEvent
  | MidiSystemMetaDeviceNameEvent
  | MidiSystemMetaTrackEndEvent
  | MidiSystemMetaInstrumentNameEvent
  | MidiSystemMetaKeySignatureEvent
  | MidiSystemMetaLyricEvent
  | MidiSystemMetaMarkerEvent
  | MidiSystemMetaPortEvent
  | MidiSystemMetaProgramNameEvent
  | MidiSystemMetaSequencerSpecificEvent
  | MidiSystemMetaTempoEvent
  | MidiSystemMetaSmpteOffsetEvent
  | MidiSystemMetaTextEvent
  | MidiSystemMetaTimeSignatureEvent
  | MidiSystemMetaTrackNameEvent;

export type MidiEvent =
  | MidiVoiceEvent
  | MidiSystemExclusiveEvent
  | MidiSystemMetaEvent;
