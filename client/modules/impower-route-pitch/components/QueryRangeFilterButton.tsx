import React, { useCallback, useMemo } from "react";
import CalendarRegularIcon from "../../../resources/icons/regular/calendar.svg";
import CalendarRangeSolidIcon from "../../../resources/icons/solid/calendar-range.svg";
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
    const filterIcon = useMemo(() => {
      return value === "All" ? (
        <CalendarRegularIcon />
      ) : (
        <CalendarRangeSolidIcon />
      );
    }, [value]);

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
