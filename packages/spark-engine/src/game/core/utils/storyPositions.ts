import {
  TOP_LEVEL_START,
  type ProgramAddress,
  type ProgramLocator,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { rootLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import type { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { chunkOfAddress } from "@impower/sparkdown/src/program/ProgramChunk";

export interface StoryPositions {
  readonly locator: ProgramLocator;
  previous(): ProgramAddress | undefined;
  current(): ProgramAddress | undefined;
  stack(): ProgramAddress[];
  jumpTo(address: ProgramAddress): void;
  jumpToFlow(flow: string): void;
  holds(address: ProgramAddress | null | undefined): boolean;
}

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
  jumpTo: (address) => {
    if (address === TOP_LEVEL_START) {
      story.ChoosePathString("0");
    } else {
      story.ChooseAddress(address);
    }
  },
  jumpToFlow: (flow) => story.ChoosePathString(flow),
  holds: (address) =>
    address != null &&
    story.root.position(chunkOfAddress(address)) !== undefined,
});

export const storyPositions = (
  story: ProgramStory,
  _program: SparkProgram,
): StoryPositions => programPositions(story);
