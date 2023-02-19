/**
 * First-Half of First Byte
 * (aka First-Half of Status Byte)
 */
export const MIDI_STATUS_TYPE = {
  /** 1000 cccc | **/
  0x08: "voice_note_off",
  /** 1001 cccc | **/
  0x09: "voice_note_on",
  /** 1010 cccc | **/
  0x0a: "voice_polyphonic",
  /** 1011 cccc | **/
  0x0b: "voice_control",
  /** 1100 cccc | **/
  0x0c: "voice_program",
  /** 1101 cccc | **/
  0x0d: "voice_pressure",
  /** 1110 cccc | **/
  0x0e: "voice_pitch",
  /** 1111 ssss | **/
  0x0f: "system_exclusive",
} as const;

/**
 * Second-Half of First Byte
 * (aka Second-Half of Status Byte for Voice Messages)
 */
export const MIDI_STATUS_CHANNEL = {
  /** vvvv 0000 | **/
  0x00: 0,
  /** vvvv 0001 | **/
  0x01: 1,
  /** vvvv 0010 | **/
  0x02: 2,
  /** vvvv 0011 | **/
  0x03: 3,
  /** vvvv 0100 | **/
  0x04: 4,
  /** vvvv 0101 | **/
  0x05: 5,
  /** vvvv 0110 | **/
  0x06: 6,
  /** vvvv 0111 | **/
  0x07: 7,
  /** vvvv 1000 | **/
  0x08: 8,
  /** vvvv 1001 | **/
  0x09: 9,
  /** vvvv 1010 | **/
  0x0a: 10,
  /** vvvv 1011 | **/
  0x0b: 11,
  /** vvvv 1100 | **/
  0x0c: 12,
  /** vvvv 1101 | **/
  0x0d: 13,
  /** vvvv 1110 | **/
  0x0e: 14,
  /** vvvv 1111 | **/
  0x0f: 15,
} as const;

/**
 * First Byte
 * (aka Status Byte for System Messages)
 */
export const MIDI_STATUS_SYSTEM = {
  /** 1111 0000 | **/
  0xf0: "system_exclusive",
  /** 1111 1111 | **/
  0xff: "system_meta",
} as const;

/**
 * Second Byte
 * (aka Data Byte for System Meta Messages)
 */
export const MIDI_SYSTEM_META = {
  /** 1111 1111 | 0000 0001 **/
  0x01: "system_meta_text",
  /** 1111 1111 | 0000 0010 **/
  0x02: "system_meta_copyright",
  /** 1111 1111 | 0000 0011 **/
  0x03: "system_meta_track_name",
  /** 1111 1111 | 0000 0100 **/
  0x04: "system_meta_instrument_name",
  /** 1111 1111 | 0000 0101 **/
  0x05: "system_meta_lyric",
  /** 1111 1111 | 0000 0110 **/
  0x06: "system_meta_marker",
  /** 1111 1111 | 0000 0111 **/
  0x07: "system_meta_cue",
  /** 1111 1111 | 0000 1000 **/
  0x08: "system_meta_program_name",
  /** 1111 1111 | 0000 1001 **/
  0x09: "system_meta_device_name",
  /** 1111 1111 | 0000 1010 **/
  0x0a: "system_meta_text_00",
  /** 1111 1111 | 0000 1011 **/
  0x0b: "system_meta_text_01",
  /** 1111 1111 | 0000 1100 **/
  0x0c: "system_meta_text_02",
  /** 1111 1111 | 0000 1101 **/
  0x0d: "system_meta_text_03",
  /** 1111 1111 | 0000 1110 **/
  0x0e: "system_meta_text_04",
  /** 1111 1111 | 0000 1111 **/
  0x0f: "system_meta_text_05",
  /** 1111 1111 | 0010 0000 **/
  0x20: "system_meta_channel_prefix",
  /** 1111 1111 | 0010 0001 **/
  0x21: "system_meta_port",
  /** 1111 1111 | 0010 1111 **/
  0x2f: "system_meta_track_end",
  /** 1111 1111 | 0101 0001 **/
  0x51: "system_meta_tempo",
  /** 1111 1111 | 0101 0100 **/
  0x54: "system_meta_smpte",
  /** 1111 1111 | 0101 1000 **/
  0x58: "system_meta_time_signature",
  /** 1111 1111 | 0101 1001 **/
  0x59: "system_meta_key_signature",
  /** 1111 1111 | 0111 1111 **/
  0x7f: "system_meta_sequencer",
} as const;
