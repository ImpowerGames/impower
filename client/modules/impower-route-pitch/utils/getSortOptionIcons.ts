import React from "react";
import FireRegularIcon from "../../../resources/icons/regular/fire.svg";
import SeedlingRegularIcon from "../../../resources/icons/regular/seedling.svg";
import TrophyStarRegularIcon from "../../../resources/icons/regular/trophy-star.svg";
import FireSolidIcon from "../../../resources/icons/solid/fire.svg";
import SeedlingSolidIcon from "../../../resources/icons/solid/seedling.svg";
import TrophyStarSolidIcon from "../../../resources/icons/solid/trophy-star.svg";
import { Sort } from "../types/sort";

export const getSortOptionIcons = (
  filter: Sort
): {
  [filter in Sort]: React.ComponentType;
} => ({
  new: filter === "new" ? SeedlingSolidIcon : SeedlingRegularIcon,
  rating: filter === "rating" ? TrophyStarSolidIcon : TrophyStarRegularIcon,
  rank: filter === "rank" ? FireSolidIcon : FireRegularIcon,
});

export default getSortOptionIcons;
