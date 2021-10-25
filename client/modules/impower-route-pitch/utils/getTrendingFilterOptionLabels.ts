import { TrendingFilter } from "../types/trendingFilter";

export const getTrendingOptionLabels = (): {
  [filter in TrendingFilter]: string;
} => ({
  Hot: "Hot",
  New: "New",
});

export default getTrendingOptionLabels;
