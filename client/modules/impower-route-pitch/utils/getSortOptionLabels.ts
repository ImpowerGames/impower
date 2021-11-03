import { Sort } from "../types/sort";

export const getSortOptionLabels = (): {
  [filter in Sort]: string;
} => ({
  new: "New",
  rating: "Best",
  rank: "Hot",
});

export default getSortOptionLabels;
