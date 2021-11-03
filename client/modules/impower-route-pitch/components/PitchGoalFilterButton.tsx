import React, { useCallback, useMemo } from "react";
import BinocularsRegularIcon from "../../../resources/icons/regular/binoculars.svg";
import HandshakeSimpleRegularIcon from "../../../resources/icons/regular/handshake-simple.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import { PitchGoalFilter } from "../types/pitchGoalFilter";
import getPitchGoalFilterOptionLabels from "../utils/getPitchGoalFilterOptionLabels";
import FilterButton from "./FilterButton";

interface PitchGoalFilterButtonProps {
  activeFilterValue?: PitchGoalFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const PitchGoalFilterButton = React.memo(
  (props: PitchGoalFilterButtonProps): JSX.Element => {
    const { activeFilterValue, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        activeFilterValue: PitchGoalFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getGoalFilterOptionIcons = (
          await import("../utils/getPitchGoalFilterOptionIcons")
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
        target="pitch"
        menuType="goal"
        filterLabel={`Looking For`}
        filterIcon={filterIcon}
        activeFilterValue={activeFilterValue}
        getOptionLabels={getPitchGoalFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default PitchGoalFilterButton;
