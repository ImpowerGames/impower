import React, { useCallback } from "react";
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
    const handleGetActiveOptionIcon = useCallback((value?: string) => {
      return value === "collaboration" ? (
        <HandshakeSimpleRegularIcon />
      ) : value === "inspiration" ? (
        <LightbulbOnRegularIcon />
      ) : (
        <BinocularsRegularIcon />
      );
    }, []);
    return (
      <QueryButton
        target="pitch"
        menuType="filter"
        label={`Looking For`}
        value={value}
        getOptionLabels={getPitchGoalFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        getActiveOptionIcon={handleGetActiveOptionIcon}
        onOption={onOption}
      />
    );
  }
);

export default QueryGoalFilterButton;
