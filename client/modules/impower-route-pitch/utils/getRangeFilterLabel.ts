import { DateRangeFilter } from "../types/dateRangeFilter";

const rangeFilterLabels: { [filter in DateRangeFilter]: string } = {
  d: "Today",
  w: "This Week",
  mo: "This Month",
  yr: "This Year",
  All: "All Time",
};

export const getRangeFilterLabel = (filter: DateRangeFilter): string =>
  rangeFilterLabels[filter];

export default getRangeFilterLabel;
