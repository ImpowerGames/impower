import { Create } from "../../core/types/Create";
import { Inflection } from "../types/Inflection";

export const _inflection: Create<Inflection> = () => ({
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
  liltQuestion: [1, 2, 3, 4, 5],
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
  liltExclamation: [3, 4, 5, 6, 7],
  /**
   *  3   ┌─┐
   *  2   │ │
   *  1 ──┘ │
   *  0     │
   * -1     │
   * -2     │
   * -3     │
   * -4     │
   * -5     └──
   *
   *  Yes(~)
   */
  lilt: [1, 3, -5],
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
  resolvedAnxiousQuestion: [-1, 0],
  /**
   *  2   ┌──
   *  1   │
   *  0   │
   * -1 ──┘
   *
   *  Yes(...?)
   */
  anxiousQuestion: [-1, 2],
  /**
   *  1 ─────
   *  0
   * -1
   *
   *  Who's that(?)
   */
  resolvedQuestion: [1, 1],
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
});
