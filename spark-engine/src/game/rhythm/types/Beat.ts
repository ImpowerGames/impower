import { SwipeSymbol } from "./SwipeSymbol";

export interface Beat {
  /** 0-3 (left -> right) **/
  x?: number;
  /** 0-2 (bottom -> top) **/
  y?: number;
  /** measure number **/
  z?: number;
  /** swipe direction **/
  s?: SwipeSymbol;
  /** beats per minute **/
  bpm?: number;
}
