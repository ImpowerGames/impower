import { PRNG } from "./PRNG";

/** The state a random draw reads and advances: the story's seed and the
 *  value the draw before it gave. The story's state holds them. */
export interface RandomState {
  storySeed: number;
  previousRandom: number;
}

/**
 * How many times a story has drawn from its seed: a random draw or a
 * shuffle's pick. A story whose state was made anew draws from a seed of its
 * own (`ProgramStoryState`), so a host that replays the same code from such
 * a state compares the count before and after the replay (#657).
 */
export const storyDraws = { count: 0 };

/**
 * The story's next random number, as `math.random` draws it: a generator
 * seeded from the story seed and the previous draw, whose value becomes the
 * previous draw. Every random draw of a story reads it, so a state restored
 * to an earlier point draws again what it drew there
 * (docs/engine/binary-program.md, section 7, Rewind and roll forward).
 */
export const drawStoryRandom = (state: RandomState): number => {
  storyDraws.count += 1;
  const next = new PRNG(state.storySeed + state.previousRandom).next();
  state.previousRandom = next;
  return next;
};
