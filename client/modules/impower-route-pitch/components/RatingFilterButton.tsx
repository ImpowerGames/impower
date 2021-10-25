import React, { useCallback, useMemo } from "react";
import ArrowDownLongRegularIcon from "../../../resources/icons/regular/arrow-down-long.svg";
import BarsSortRegularIcon from "../../../resources/icons/regular/bars-sort.svg";
import { RatingFilter } from "../types/ratingFilter";
import getRatingFilterOptionLabels from "../utils/getRatingFilterOptionLabels";
import FilterButton from "./FilterButton";

interface FilterButtonProps {
  target?: "pitch" | "contribution";
  activeFilterValue?: RatingFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const RatingFilterButton = React.memo(
  (props: FilterButtonProps): JSX.Element => {
    const { target, activeFilterValue, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        activeFilterValue: RatingFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getRatingFilterOptionIcons = (
          await import("../utils/getRatingFilterOptionIcons")
        ).default;
        return getRatingFilterOptionIcons(activeFilterValue);
      },
      []
    );
    const filterIcon = useMemo(
      () =>
        activeFilterValue === "Best" ? (
          <BarsSortRegularIcon />
        ) : (
          <ArrowDownLongRegularIcon />
        ),
      [activeFilterValue]
    );
    return (
      <FilterButton
        target={target}
        menuType="rating"
        filterLabel={`Sort By`}
        filterIcon={filterIcon}
        activeFilterValue={activeFilterValue}
        flexDirection="row-reverse"
        getOptionLabels={getRatingFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default RatingFilterButton;
