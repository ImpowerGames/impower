import { InputSymbol } from "./InputSymbol";

export interface Beat {
  /** measure number (in beats) **/
  n?: number;
  /** 0-3 (left -> right) **/
  x?: number;
  /** 0-2 (bottom -> top) **/
  y?: number;
  /** direction (of swipe) **/
  d?: InputSymbol;
  /** beats per minute **/
  bpm?: number;
}
