import { EASINGS } from "./easings";

/** Gets a list of all supported easing function names. */
export const getEasingNames = () => {
  return Object.entries(EASINGS).map(([name]) => name);
};
