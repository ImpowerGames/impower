import { Inflection } from "../types/Inflection";

export const default_inflection = (obj?: Partial<Inflection>): Inflection => ({
  $link: {
    image: {},
    audio: {},
    synth: {},
    character: {},
    typewriter: {},
    prosody: {},
  },
  /**
   *  5         ┌──
   *  4       ┌─┘
   *  3     ┌─┘
   *  2   ┌─┘
   *  1 ──┘
   *  0
   * -1
   *
   *  Yes(~?)
   */
  lilt_question: [1, 2, 3, 4, 5],
  /**
   *  7         ┌──
   *  6       ┌─┘
   *  5     ┌─┘
   *  4   ┌─┘
   *  3 ──┘
   *  2
   *  1
   *  0
   * -1
   *
   *  Yes(~!)
   */
  lilt_exclamation: [3, 4, 5, 6, 7],
  /**
   * 10       ┌──
   *  9       │
   *  8       │
   *  7     ┌─┘
   *  6     │
   *  5     │
   *  4     │
   *  3     │
   *  2     │
   *  1 ──┐ │
   *  0   │ │
   * -1   │ │
   * -2   └─┘
   *
   *  Yes(~)
   */
  lilt: [1, -2, 7, 10],
  /**
   * 10     ┌─┐
   *  9     │ │
   *  8     │ │
   *  7     │ └──
   *  6     │
   *  5     │
   *  4     │
   *  3     │
   *  2     │
   *  1 ──┐ │
   *  0   │ │
   * -1   │ │
   * -2   │ │
   * -3   │ │
   * -4   └─┘
   *
   *  Yes(~...)
   */
  anxious_lilt: [1, -4, 10, 7],
  /**
   *  5   ┌──
   *  4   │
   *  3   │
   *  2 ──┘
   *  1
   *  0
   * -1
   *
   *  Yes(!)
   */
  exclamation: [2, 5],
  /**
   *  1
   *  0   ┌──
   * -1 ──┘
   *
   *  Who's that(...?)
   */
  resolved_anxious_question: [-1, 0],
  /**
   *  2   ┌──
   *  1   │
   *  0   │
   * -1 ──┘
   *
   *  Yes(...?)
   */
  anxious_question: [-1, 2],
  /**
   *  1 ─────
   *  0
   * -1
   *
   *  Who's that(?)
   */
  resolved_question: [1, 1],
  /**
   *  1
   *  0
   * -1 ─────
   *
   *  Yes(...)
   */
  anxious: [-1, -1],
  /**
   *  2   ┌──
   *  1   │
   *  0 ──┘
   * -1
   *
   *  Yes(?)
   */
  question: [0, 2],
  /**
   *  1 ─────
   *  0
   * -1
   *
   *  Yes(--)
   */
  partial: [1, 1],
  /**
   *  1
   *  0
   * -1 ─────
   *
   *  Yes(,)
   */
  comma: [-1, -1],
  /**
   *  1
   *  0 ─────
   * -1
   *
   *  Yes(.)
   */
  statement: [0, 0],
  ...(obj || {}),
});
