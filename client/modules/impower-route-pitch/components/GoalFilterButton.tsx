import React, { useCallback, useMemo } from "react";
import BinocularsRegularIcon from "../../../resources/icons/regular/binoculars.svg";
import HandshakeSimpleRegularIcon from "../../../resources/icons/regular/handshake-simple.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import { GoalFilter } from "../types/goalFilter";
import getGoalFilterOptionLabels from "../utils/getGoalFilterOptionLabels";
import FilterButton from "./FilterButton";

interface FilterButtonProps {
  target?: "pitch" | "contribution";
  activeFilterValue?: GoalFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const GoalFilterButton = React.memo((props: FilterButtonProps): JSX.Element => {
  const { target, activeFilterValue, onOption } = props;
  const handleGetOptionIcons = useCallback(
    async (
      activeFilterValue: GoalFilter
    ): Promise<{
      [option: string]: React.ComponentType;
    }> => {
      const getGoalFilterOptionIcons = (
        await import("../utils/getGoalFilterOptionIcons")
      ).default;
      return getGoalFilterOptionIcons(activeFilterValue);
    },
    []
  );
  const filterIcon = useMemo(
    () =>
      activeFilterValue === "collaboration" ? (
        <HandshakeSimpleRegularIcon />
      ) : activeFilterValue === "inspiration" ? (
        <LightbulbOnRegularIcon />
      ) : (
        <BinocularsRegularIcon />
      ),
    [activeFilterValue]
  );
  return (
    <FilterButton
      target={target}
      menuType="goal"
      filterLabel={`Looking For`}
      filterIcon={filterIcon}
      activeFilterValue={activeFilterValue}
      getOptionLabels={getGoalFilterOptionLabels}
      getOptionIcons={handleGetOptionIcons}
      onOption={onOption}
    />
  );
});

export default GoalFilterButton;
