/**
 * First-Half of First Byte
 * (aka First-Half of Status Byte)
 */
export const MIDI_STATUS_TYPE = {
  /** 1000 cccc | */
  voice_note_off: 0x08,
  /** 1001 cccc | */
  voice_note_on: 0x09,
  /** 1010 cccc | */
  voice_polyphonic_key_pressure: 0x0a,
  /** 1011 cccc | */
  voice_controller_change: 0x0b,
  /** 1100 cccc | */
  voice_program_change: 0x0c,
  /** 1101 cccc | */
  voice_channel_pressure: 0x0d,
  /** 1110 cccc | */
  voice_pitch_bend: 0x0e,
  /** 1111 cccc | */
  system: 0xff,
} as const;

/**
 * First Byte
 * (aka Status Byte for System Messages)
 */
export const MIDI_STATUS_SYSTEM = {
  /** 1111 0000 | */
  system_exclusive: 0xf0,
  /** 1111 1111 | */
  system_meta: 0xff,
} as const;
