import { PitchGoalFilter } from "../types/pitchGoalFilter";

const getPitchGoalFilterOptionLabels = (): {
  [filter in PitchGoalFilter]: string;
} => ({
  All: "All",
  collaboration: "Collaboration",
  inspiration: "Inspiration",
});

export default getPitchGoalFilterOptionLabels;
