import { PitchGoalFilter } from "../types/pitchGoalFilter";

const getPitchGoalFilterOptionLabels = (): {
  [filter in PitchGoalFilter]: string;
} => ({
  all: "All",
  collaboration: "Collaboration",
  inspiration: "Inspiration",
});

export default getPitchGoalFilterOptionLabels;
