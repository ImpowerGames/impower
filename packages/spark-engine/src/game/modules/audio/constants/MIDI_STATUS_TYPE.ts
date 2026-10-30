export const MIDI_STATUS_TYPE = {
  voice_note_off: 0x08,
  voice_note_on: 0x09,
  voice_polyphonic_key_pressure: 0x0a,
  voice_controller_change: 0x0b,
  voice_program_change: 0x0c,
  voice_channel_pressure: 0x0d,
  voice_pitch_bend: 0x0e,
  system: 0xff,
} as const;

export const MIDI_STATUS_SYSTEM = {
  system_exclusive: 0xf0,
  system_meta: 0xff,
} as const;
