/**
 * BeatSaver Note Schema
 * https://bsmg.wiki/mapping/map-format.html#base-object-2
 */

export interface BSNote {
  /** time in beats (spark) **/
  z?: number;
  /** time in beats (v3) **/
  b?: number;
  /** time in beats (v2) **/
  _time?: number;

  /** x coordinate (spark|v3) **/
  x?: number;
  /** x coordinate (v2) **/
  _lineIndex?: number;

  /** y coordinate (spark|v3) **/
  y?: number;
  /** y coordinate (v2) **/
  _lineLayer?: number;

  /** swipe direction (spark) **/
  s?: string;
  /** cut direction (v3) **/
  d?: number;
  /** cut direction (v2) **/
  _cutDirection?: number;
}
