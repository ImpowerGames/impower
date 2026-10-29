import { PRNG } from "./PRNG";

export interface RandomState {
  storySeed: number;
  previousRandom: number;
}

export const storyDraws = { count: 0 };

export const drawStoryRandom = (state: RandomState): number => {
  storyDraws.count += 1;
  const next = new PRNG(state.storySeed + state.previousRandom).next();
  state.previousRandom = next;
  return next;
};
