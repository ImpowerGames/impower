import { QuerySort } from "../../impower-data-store";

export const getSortOptionLabels = (): {
  [filter in QuerySort]: string;
} => ({
  new: "New",
  rating: "Best",
  rank: "Hot",
});

export default getSortOptionLabels;
