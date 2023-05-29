import type {
  ComputePositionConfig,
  FloatingElement,
  ReferenceElement,
} from "./types";
/**
 * Computes the `x` and `y` coordinates that will place the floating element
 * next to a reference element when it is given a certain CSS positioning
 * strategy.
 */
export declare const computePosition: (
  reference: ReferenceElement,
  floating: FloatingElement,
  options?: Partial<ComputePositionConfig>
) => Promise<import("../../core").ComputePositionReturn>;
export {
  arrow,
  autoPlacement,
  detectOverflow,
  flip,
  hide,
  inline,
  limitShift,
  offset,
  shift,
  size,
} from "../../core";
export { autoUpdate } from "./autoUpdate";
export { platform } from "./platform";
export { getOverflowAncestors } from "./utils/getOverflowAncestors";
