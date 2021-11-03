import { ContributionTypeFilter } from "../types/contributionTypeFilter";

const getContributionTypeFilterOptionLabels = (): {
  [filter in ContributionTypeFilter]: string;
} => ({
  All: "All",
  pitch: "Pitch",
  story: "Story",
  image: "Image",
  audio: "Audio",
});

export default getContributionTypeFilterOptionLabels;
