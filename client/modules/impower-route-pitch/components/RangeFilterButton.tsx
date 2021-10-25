import React, { useCallback, useMemo } from "react";
import ArrowDownWideShortRegularIcon from "../../../resources/icons/regular/arrow-down-wide-short.svg";
import { DateRangeFilter } from "../types/dateRangeFilter";
import getRangeFilterOptionLabels from "../utils/getRangeFilterOptionLabels";
import FilterButton from "./FilterButton";

interface FilterButtonProps {
  target?: "pitch" | "contribution";
  activeFilterValue?: DateRangeFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const RangeFilterButton = React.memo(
  (props: FilterButtonProps): JSX.Element => {
    const { target, activeFilterValue, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        activeFilterValue: DateRangeFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getRangeFilterOptionIcons = (
          await import("../utils/getRangeFilterOptionIcons")
        ).default;
        return getRangeFilterOptionIcons(activeFilterValue);
      },
      []
    );
    const filterIcon = useMemo(() => <ArrowDownWideShortRegularIcon />, []);
    return (
      <FilterButton
        target={target}
        menuType="range"
        filterLabel={`Top Posts From`}
        filterIcon={filterIcon}
        flexDirection="row-reverse"
        activeFilterValue={activeFilterValue}
        getOptionLabels={getRangeFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default RangeFilterButton;
