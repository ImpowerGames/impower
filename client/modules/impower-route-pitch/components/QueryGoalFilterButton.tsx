import React, { useCallback, useMemo } from "react";
import BinocularsRegularIcon from "../../../resources/icons/regular/binoculars.svg";
import HandshakeSimpleRegularIcon from "../../../resources/icons/regular/handshake-simple.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import { PitchGoalFilter } from "../types/pitchGoalFilter";
import getPitchGoalFilterOptionLabels from "../utils/getPitchGoalFilterOptionLabels";
import QueryButton from "./QueryButton";

interface QueryGoalFilterButtonProps {
  value?: PitchGoalFilter;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const QueryGoalFilterButton = React.memo(
  (props: QueryGoalFilterButtonProps): JSX.Element => {
    const { value, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        value: PitchGoalFilter
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getGoalFilterOptionIcons = (
          await import("../utils/getPitchGoalFilterOptionIcons")
        ).default;
        return getGoalFilterOptionIcons(value);
      },
      []
    );
    const filterIcon = useMemo(
      () =>
        value === "collaboration" ? (
          <HandshakeSimpleRegularIcon />
        ) : value === "inspiration" ? (
          <LightbulbOnRegularIcon />
        ) : (
          <BinocularsRegularIcon />
        ),
      [value]
    );
    return (
      <QueryButton
        target="pitch"
        menuType="filter"
        label={`Looking For`}
        icon={filterIcon}
        value={value}
        getOptionLabels={getPitchGoalFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default QueryGoalFilterButton;
