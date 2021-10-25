import React from "react";
import FireRegularIcon from "../../../resources/icons/regular/fire.svg";
import SeedlingRegularIcon from "../../../resources/icons/regular/seedling.svg";
import FireSolidIcon from "../../../resources/icons/solid/fire.svg";
import SeedlingSolidIcon from "../../../resources/icons/solid/seedling.svg";
import { TrendingFilter } from "../types/trendingFilter";

export const getTrendingOptionIcons = (
  filter: TrendingFilter
): {
  [filter in TrendingFilter]: React.ComponentType;
} => ({
  Hot: filter === "Hot" ? FireSolidIcon : FireRegularIcon,
  New: filter === "New" ? SeedlingSolidIcon : SeedlingRegularIcon,
});

export default getTrendingOptionIcons;
