import { RatingFilter } from "../types/ratingFilter";

const getRatingFilterOptionLabels = (): {
  [filter in RatingFilter]: string;
} => ({
  Best: "Best",
  New: "New",
});

export default getRatingFilterOptionLabels;
