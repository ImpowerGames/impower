import { GoalFilter } from "../types/goalFilter";

const getGoalFilterOptionLabels = (): {
  [filter in GoalFilter]: string;
} => ({
  All: "All",
  collaboration: "Collaboration",
  inspiration: "Inspiration",
});

export default getGoalFilterOptionLabels;
