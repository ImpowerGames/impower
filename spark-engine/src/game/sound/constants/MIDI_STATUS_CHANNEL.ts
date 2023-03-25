/**
 * Second-Half of First Byte
 * (aka Second-Half of Status Byte for Voice Messages)
 */
export const MIDI_STATUS_CHANNEL = {
  /** vvvv 0000 | */
  0: 0x00,
  /** vvvv 0001 | */
  1: 0x01,
  /** vvvv 0010 | */
  2: 0x02,
  /** vvvv 0011 | */
  3: 0x03,
  /** vvvv 0100 | */
  4: 0x04,
  /** vvvv 0101 | */
  5: 0x05,
  /** vvvv 0110 | */
  6: 0x06,
  /** vvvv 0111 | */
  7: 0x07,
  /** vvvv 1000 | */
  8: 0x08,
  /** vvvv 1001 | */
  9: 0x09,
  /** vvvv 1010 | */
  10: 0x0a,
  /** vvvv 1011 | */
  11: 0x0b,
  /** vvvv 1100 | */
  12: 0x0c,
  /** vvvv 1101 | */
  13: 0x0d,
  /** vvvv 1110 | */
  14: 0x0e,
  /** vvvv 1111 | */
  15: 0x0f,
} as const;
