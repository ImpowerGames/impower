import { Create } from "../../core/types/Create";
import { Inflection } from "../types/Inflection";

export const _inflection: Create<Inflection> = () => ({
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
   *  4   ┌─┐
   *  3   │ │
   *  2   │ └──
   *  1 ──┘
   *  0
   * -1
   *
   *  Yes(~?)
   */
  liltQuestion: [1, 4, 2],
  /**
   *  5   ┌─┐
   *  4   │ └──
   *  3   │
   *  2   │
   *  1 ──┘
   *  0
   * -1
   *
   *  Yes(~!)
   */
  liltExclamation: [1, 5, 4],
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
   *  2
   *  1
   *  0   ┌──
   * -1 ──┘
   * -2
   * -3
   * -4
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
