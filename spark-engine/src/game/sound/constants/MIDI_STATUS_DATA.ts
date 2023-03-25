/**
 * Second Byte
 * (aka Data Byte for System Meta Messages)
 */
export const MIDI_STATUS_DATA = {
  /** 1111 1111 | 0000 0001 */
  system_meta_text: 0x01,
  /** 1111 1111 | 0000 0010 */
  system_meta_copyright: 0x02,
  /** 1111 1111 | 0000 0011 */
  system_meta_track_name: 0x03,
  /** 1111 1111 | 0000 0100 */
  system_meta_instrument_name: 0x04,
  /** 1111 1111 | 0000 0101 */
  system_meta_lyric: 0x05,
  /** 1111 1111 | 0000 0110 */
  system_meta_marker: 0x06,
  /** 1111 1111 | 0000 0111 */
  system_meta_cue: 0x07,
  /** 1111 1111 | 0000 1000 */
  system_meta_program_name: 0x08,
  /** 1111 1111 | 0000 1001 */
  system_meta_device_name: 0x09,
  /** 1111 1111 | 0000 1010 */
  system_meta_text_00: 0x0a,
  /** 1111 1111 | 0000 1011 */
  system_meta_text_01: 0x0b,
  /** 1111 1111 | 0000 1100 */
  system_meta_text_02: 0x0c,
  /** 1111 1111 | 0000 1101 */
  system_meta_text_03: 0x0d,
  /** 1111 1111 | 0000 1110 */
  system_meta_text_04: 0x0e,
  /** 1111 1111 | 0000 1111 */
  system_meta_text_05: 0x0f,
  /** 1111 1111 | 0010 0000 */
  system_meta_channel_prefix: 0x20,
  /** 1111 1111 | 0010 0001 */
  system_meta_port: 0x21,
  /** 1111 1111 | 0010 1111 */
  system_meta_track_end: 0x2f,
  /** 1111 1111 | 0101 0001 */
  system_meta_tempo: 0x51,
  /** 1111 1111 | 0101 0100 */
  system_meta_smpte_offset: 0x54,
  /** 1111 1111 | 0101 1000 */
  system_meta_time_signature: 0x58,
  /** 1111 1111 | 0101 1001 */
  system_meta_key_signature: 0x59,
  /** 1111 1111 | 0111 1111 */
  system_meta_sequencer_specific: 0x7f,
} as const;
