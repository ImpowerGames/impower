import { DateRangeFilter } from "../types/dateRangeFilter";
import getRangeFilterLabel from "./getRangeFilterLabel";

export const getRangeFilterOptionLabels = (): {
  [filter in DateRangeFilter]: string;
} => ({
  d: getRangeFilterLabel("d"),
  w: getRangeFilterLabel("w"),
  mo: getRangeFilterLabel("mo"),
  yr: getRangeFilterLabel("yr"),
  all: getRangeFilterLabel("all"),
});

export default getRangeFilterOptionLabels;
