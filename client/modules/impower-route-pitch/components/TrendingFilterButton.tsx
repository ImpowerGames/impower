import React, { useCallback, useMemo } from "react";
import FireRegularIcon from "../../../resources/icons/regular/fire.svg";
import SeedlingRegularIcon from "../../../resources/icons/regular/seedling.svg";
import { TrendingFilter } from "../types/trendingFilter";
import getTrendingOptionLabels from "../utils/getTrendingFilterOptionLabels";
import FilterButton from "./FilterButton";

interface FilterButtonProps {
  target?: "pitch" | "contribution";
  activeFilterValue?: TrendingFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const TrendingFilterButton = React.memo(
  (props: FilterButtonProps): JSX.Element => {
    const { target, activeFilterValue, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        activeFilterValue: TrendingFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getTrendingFilterOptionIcons = (
          await import("../utils/getTrendingFilterOptionIcons")
        ).default;
        return getTrendingFilterOptionIcons(activeFilterValue);
      },
      []
    );
    const filterIcon = useMemo(
      () =>
        activeFilterValue === "Hot" ? (
          <FireRegularIcon />
        ) : (
          <SeedlingRegularIcon />
        ),
      [activeFilterValue]
    );
    return (
      <FilterButton
        target={target}
        menuType="trending"
        filterLabel={`Sort By`}
        filterIcon={filterIcon}
        flexDirection="row-reverse"
        activeFilterValue={activeFilterValue}
        getOptionLabels={getTrendingOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default TrendingFilterButton;
