import { ProjectType } from "../../impower-data-store";

const getPitchTypeFilterOptionLabels = (): {
  [filter in ProjectType]: string;
} => ({
  game: "Games",
  story: "Stories",
  character: "Characters",
  environment: "Environments",
  music: "Music",
  sound: "Sounds",
  voice: "Voices",
});

export default getPitchTypeFilterOptionLabels;
