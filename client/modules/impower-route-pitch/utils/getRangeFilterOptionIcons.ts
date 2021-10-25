import CircleDotRegularIcon from "../../../resources/icons/regular/circle-dot.svg";
import CircleRegularIcon from "../../../resources/icons/regular/circle.svg";
import { DateRangeFilter } from "../types/dateRangeFilter";

export const getRangeFilterOptionIcons = (
  filter: DateRangeFilter
): {
  [filter in DateRangeFilter]: React.ComponentType;
} => ({
  d: filter === "d" ? CircleDotRegularIcon : CircleRegularIcon,
  w: filter === "w" ? CircleDotRegularIcon : CircleRegularIcon,
  mo: filter === "mo" ? CircleDotRegularIcon : CircleRegularIcon,
  yr: filter === "yr" ? CircleDotRegularIcon : CircleRegularIcon,
  All: filter === "All" ? CircleDotRegularIcon : CircleRegularIcon,
});

export default getRangeFilterOptionIcons;
