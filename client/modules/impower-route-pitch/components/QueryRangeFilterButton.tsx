import React, { useCallback, useMemo } from "react";
import ArrowDownWideShortRegularIcon from "../../../resources/icons/regular/arrow-down-wide-short.svg";
import { DateRangeFilter } from "../types/dateRangeFilter";
import getRangeFilterOptionLabels from "../utils/getRangeFilterOptionLabels";
import QueryButton from "./QueryButton";

interface QueryRangeFilterButtonProps {
  target?: "pitch" | "contribution";
  value?: DateRangeFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const QueryRangeFilterButton = React.memo(
  (props: QueryRangeFilterButtonProps): JSX.Element => {
    const { target, value, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        value: DateRangeFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getRangeFilterOptionIcons = (
          await import("../utils/getRangeFilterOptionIcons")
        ).default;
        return getRangeFilterOptionIcons(value);
      },
      []
    );
    const filterIcon = useMemo(() => <ArrowDownWideShortRegularIcon />, []);
    return (
      <QueryButton
        target={target}
        menuType="filter"
        label={`Top Posts From`}
        icon={filterIcon}
        flexDirection="row-reverse"
        value={value}
        getOptionLabels={getRangeFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default QueryRangeFilterButton;
