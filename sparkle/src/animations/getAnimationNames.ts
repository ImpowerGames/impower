import { animations } from "./animations";

/** Gets a list of all supported animation names. */
export const getAnimationNames = () => {
  return Object.entries(animations).map(([name]) => name);
};
