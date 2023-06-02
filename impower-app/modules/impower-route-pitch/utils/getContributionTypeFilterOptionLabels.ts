import { ContributionTypeFilter } from "../types/contributionTypeFilter";

const getContributionTypeFilterOptionLabels = (): {
  [filter in ContributionTypeFilter]: string;
} => ({
  all: "All",
  pitch: "Pitch",
  story: "Story",
  image: "Image",
  audio: "Audio",
});

export default getContributionTypeFilterOptionLabels;
