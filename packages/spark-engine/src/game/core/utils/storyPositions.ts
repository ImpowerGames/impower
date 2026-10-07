import type {
  ProgramAddress,
  ProgramLocator,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { pointerPathString } from "@impower/sparkdown/src/compiler/utils/planRoute";
import {
  pathTableLocator,
  rootLocator,
} from "@impower/sparkdown/src/compiler/utils/programLocator";
import type { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { chunkOfAddress } from "@impower/sparkdown/src/program/StatementChunk";

/**
 * Where a game's story stands, in the addresses of the engine that runs it
 * (docs/engine/binary-program.md, section 8): the positions a game records,
 * routes to and jumps to, read from either engine, and the accessor that
 * places them in the source. The program engine names a position by a chunk
 * id and an offset; the current engine, until it is deleted, by the runtime
 * path of a pointer, which nothing outside the engine reads.
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

/** The positions of a story on the current engine, whose addresses are the
 *  runtime paths of its pointers. */
const pathPositions = (story: Story, program: SparkProgram): StoryPositions => {
  const scripts = Object.keys(program.scripts ?? {});
  const locator = pathTableLocator(program.pathLocations, scripts);
  return {
    locator,
    previous: () => pointerPathString(story.state.previousPointer),
    current: () => story.state.currentPathString ?? undefined,
    stack: () => {
      const paths: string[] = [];
      const callStack = story.state?.callStack as
        | { _threads?: Array<{ callstack?: Array<{ currentPointer?: { path?: { toString(): string } | null } }> }> }
        | undefined;
      for (const thread of callStack?._threads ?? []) {
        for (const element of thread?.callstack ?? []) {
          const path = element?.currentPointer?.path?.toString();
          if (path) {
            paths.push(path);
          }
        }
      }
      return paths;
    },
    jumpTo: (target) => story.ChoosePathString(String(target)),
    holds: (address) =>
      typeof address === "string" &&
      (locator.locationOf(address) !== undefined ||
        address === "0" ||
        Boolean(
          program.knotLocations?.[address] ||
            program.stitchLocations?.[address] ||
            program.functionLocations?.[address] ||
            program.sceneLocations?.[address] ||
            program.branchLocations?.[address],
        )),
  };
};

/** The positions of `story`, which runs `program`. */
export const storyPositions = (
  story: Story,
  program: SparkProgram,
): StoryPositions => {
  const engine: unknown = story;
  return engine instanceof ProgramStory
    ? programPositions(engine)
    : pathPositions(story, program);
};
