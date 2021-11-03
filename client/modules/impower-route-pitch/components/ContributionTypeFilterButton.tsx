import React, { useCallback, useMemo } from "react";
import BookOpenRegularIcon from "../../../resources/icons/regular/book-open.svg";
import FilterRegularIcon from "../../../resources/icons/regular/filter.svg";
import ImageRegularIcon from "../../../resources/icons/regular/image.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import VolumeHighRegularIcon from "../../../resources/icons/regular/volume-high.svg";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";
import getContributionTypeFilterOptionLabels from "../utils/getContributionTypeFilterOptionLabels";
import FilterButton from "./FilterButton";

interface ContributionTypeFilterButtonProps {
  activeFilterValue?: ContributionTypeFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const ContributionTypeFilterButton = React.memo(
  (props: ContributionTypeFilterButtonProps): JSX.Element => {
    const { activeFilterValue, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        activeFilterValue: ContributionTypeFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getContributionTypeFilterOptionIcons = (
          await import("../utils/getContributionTypeFilterOptionIcons")
        ).default;
        return getContributionTypeFilterOptionIcons(activeFilterValue);
      },
      []
    );
    const filterIcon = useMemo(
      () =>
        activeFilterValue === "pitch" ? (
          <LightbulbOnRegularIcon />
        ) : activeFilterValue === "story" ? (
          <BookOpenRegularIcon />
        ) : activeFilterValue === "image" ? (
          <ImageRegularIcon />
        ) : activeFilterValue === "audio" ? (
          <VolumeHighRegularIcon />
        ) : (
          <FilterRegularIcon />
        ),
      [activeFilterValue]
    );
    return (
      <FilterButton
        target="contribution"
        menuType="type"
        filterLabel={`Type`}
        filterIcon={filterIcon}
        activeFilterValue={activeFilterValue}
        getOptionLabels={getContributionTypeFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default ContributionTypeFilterButton;
