import BookOpenRegularIcon from "../../../resources/icons/regular/book-open.svg";
import FilterRegularIcon from "../../../resources/icons/regular/filter.svg";
import ImageRegularIcon from "../../../resources/icons/regular/image.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import VolumeHighRegularIcon from "../../../resources/icons/regular/volume-high.svg";
import BookOpenSolidIcon from "../../../resources/icons/solid/book-open.svg";
import FilterSolidIcon from "../../../resources/icons/solid/filter.svg";
import ImageSolidIcon from "../../../resources/icons/solid/image.svg";
import LightbulbOnSolidIcon from "../../../resources/icons/solid/lightbulb-on.svg";
import VolumeHighSolidIcon from "../../../resources/icons/solid/volume-high.svg";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";

const getContributionTypeFilterOptionIcons = (
  filter: ContributionTypeFilter
): {
  [filter in ContributionTypeFilter]: React.ComponentType;
} => ({
  All: filter === "All" ? FilterSolidIcon : FilterRegularIcon,
  pitch: filter === "pitch" ? LightbulbOnSolidIcon : LightbulbOnRegularIcon,
  story: filter === "story" ? BookOpenSolidIcon : BookOpenRegularIcon,
  image: filter === "image" ? ImageSolidIcon : ImageRegularIcon,
  audio: filter === "audio" ? VolumeHighSolidIcon : VolumeHighRegularIcon,
});

export default getContributionTypeFilterOptionIcons;
