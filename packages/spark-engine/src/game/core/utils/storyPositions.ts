import type {
  ProgramAddress,
  ProgramLocator,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { rootLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import type { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { chunkOfAddress } from "@impower/sparkdown/src/program/ProgramChunk";

/**
 * Where a game's story stands, in the program engine's addresses
 * (docs/engine/binary-program.md, section 8): the positions a game records,
 * routes to and jumps to, and the accessor that places them in the source.
 * The engine names a position by a chunk id and an offset.
 */
export interface StoryPositions {
  /** The accessor for the program the story runs. */
  readonly locator: ProgramLocator;
  /** The address of the position the story's last step ran, or nothing
   *  before one has. */
  previous(): ProgramAddress | undefined;
  /** The address of the position the story runs next, or nothing when it
   *  stands nowhere. */
  current(): ProgramAddress | undefined;
  /** The addresses the story will come back to: where every open tunnel,
   *  thread and function call returns, with the position. */
  stack(): ProgramAddress[];
  /** Moves the story to an address, or to the top of a flow named by its
   *  qualified name (a route's start). */
  jumpTo(target: ProgramAddress): void;
  /** Whether the program holds the address. */
  holds(address: ProgramAddress | null | undefined): boolean;
}

/** The positions of a story on the program engine. */
const programPositions = (story: ProgramStory): StoryPositions => ({
  locator: rootLocator(story.root),
  previous: () => {
    const address = story.previousAddress;
    return address >= 0 ? address : undefined;
  },
  current: () => {
    const address = story.currentAddress;
    return address >= 0 ? address : undefined;
  },
  stack: () => story.stackAddresses(),
  jumpTo: (target) => {
    if (typeof target === "number") {
      story.ChooseAddress(target);
    } else {
      story.ChoosePathString(target);
    }
  },
  holds: (address) =>
    typeof address === "number" &&
    story.root.position(chunkOfAddress(address)) !== undefined,
});

/** The positions of `story`, which runs `program`. */
export const storyPositions = (
  story: ProgramStory,
  _program: SparkProgram,
): StoryPositions => programPositions(story);
