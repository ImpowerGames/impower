import React from "react";
import SeedlingRegularIcon from "../../../resources/icons/regular/seedling.svg";
import TrophyStarRegularIcon from "../../../resources/icons/regular/trophy-star.svg";
import SeedlingSolidIcon from "../../../resources/icons/solid/seedling.svg";
import TrophyStarSolidIcon from "../../../resources/icons/solid/trophy-star.svg";
import { RatingFilter } from "../types/ratingFilter";

const getRatingFilterOptionIcons = (
  filter: RatingFilter
): {
  [filter in RatingFilter]: React.ComponentType;
} => ({
  Best: filter === "Best" ? TrophyStarSolidIcon : TrophyStarRegularIcon,
  New: filter === "New" ? SeedlingSolidIcon : SeedlingRegularIcon,
});

export default getRatingFilterOptionIcons;
