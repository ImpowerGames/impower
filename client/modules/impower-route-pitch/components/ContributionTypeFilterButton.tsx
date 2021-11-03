import React, { useCallback, useMemo } from "react";
import BookOpenRegularIcon from "../../../resources/icons/regular/book-open.svg";
import FilterRegularIcon from "../../../resources/icons/regular/filter.svg";
import ImageRegularIcon from "../../../resources/icons/regular/image.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import VolumeHighRegularIcon from "../../../resources/icons/regular/volume-high.svg";
import { ContributionTypeFilter } from "../types/contributionTypeFilter";
import getContributionTypeFilterOptionLabels from "../utils/getContributionTypeFilterOptionLabels";
import QueryButton from "./QueryButton";

interface ContributionTypeFilterButtonProps {
  value?: ContributionTypeFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const ContributionTypeFilterButton = React.memo(
  (props: ContributionTypeFilterButtonProps): JSX.Element => {
    const { value, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        value: ContributionTypeFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getContributionTypeFilterOptionIcons = (
          await import("../utils/getContributionTypeFilterOptionIcons")
        ).default;
        return getContributionTypeFilterOptionIcons(value);
      },
      []
    );
    const icon = useMemo(
      () =>
        value === "pitch" ? (
          <LightbulbOnRegularIcon />
        ) : value === "story" ? (
          <BookOpenRegularIcon />
        ) : value === "image" ? (
          <ImageRegularIcon />
        ) : value === "audio" ? (
          <VolumeHighRegularIcon />
        ) : (
          <FilterRegularIcon />
        ),
      [value]
    );
    return (
      <QueryButton
        target="contribution"
        menuType="type"
        label={`Type`}
        icon={icon}
        value={value}
        getOptionLabels={getContributionTypeFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default ContributionTypeFilterButton;
