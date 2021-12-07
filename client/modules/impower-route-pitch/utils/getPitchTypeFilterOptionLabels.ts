import { ProjectTypeFilter } from "../types/projectTypeFilter";

const getPitchTypeFilterOptionLabels = (): {
  [filter in ProjectTypeFilter]: string;
} => ({
  all: "All",
  game: "Games",
  story: "Stories",
  character: "Characters",
  environment: "Environments",
  music: "Music",
  sound: "Sounds",
  voice: "Voices",
});

export default getPitchTypeFilterOptionLabels;
