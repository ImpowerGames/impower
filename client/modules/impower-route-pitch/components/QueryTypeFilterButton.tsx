import React, { useCallback, useMemo } from "react";
import BookOpenRegularIcon from "../../../resources/icons/regular/book-open.svg";
import FlaskRoundPotionRegularIcon from "../../../resources/icons/regular/flask-round-potion.svg";
import GamepadRegularIcon from "../../../resources/icons/regular/gamepad.svg";
import HouseRegularIcon from "../../../resources/icons/regular/house.svg";
import MicrophoneRegularIcon from "../../../resources/icons/regular/microphone.svg";
import MusicRegularIcon from "../../../resources/icons/regular/music.svg";
import SidebarRegularIcon from "../../../resources/icons/regular/sidebar.svg";
import UserRegularIcon from "../../../resources/icons/regular/user.svg";
import WaveformRegularIcon from "../../../resources/icons/regular/waveform.svg";
import { ProjectType } from "../../impower-data-store";
import getPitchTypeFilterOptionLabels from "../utils/getPitchTypeFilterOptionLabels";
import QueryButton from "./QueryButton";

interface QueryTypeFilterButtonProps {
  value?: ProjectType;
  onOption?: (e: React.MouseEvent, option: string) => void;
}

const QueryTypeFilterButton = React.memo(
  (props: QueryTypeFilterButtonProps): JSX.Element => {
    const { value, onOption } = props;
    const handleGetOptionIcons = useCallback(
      async (
        value: ProjectType
      ): Promise<{
        [option: string]: React.ComponentType;
      }> => {
        const getTypeFilterOptionIcons = (
          await import("../utils/getPitchTypeFilterOptionIcons")
        ).default;
        return getTypeFilterOptionIcons(value);
      },
      []
    );
    const filterIcon = useMemo(
      () =>
        value === "game" ? (
          <GamepadRegularIcon />
        ) : value === "story" ? (
          <BookOpenRegularIcon />
        ) : value === "character" ? (
          <UserRegularIcon />
        ) : value === "setting" ? (
          <HouseRegularIcon />
        ) : value === "prop" ? (
          <FlaskRoundPotionRegularIcon />
        ) : value === "interface" ? (
          <SidebarRegularIcon />
        ) : value === "music" ? (
          <MusicRegularIcon />
        ) : value === "sound" ? (
          <WaveformRegularIcon />
        ) : value === "voice" ? (
          <MicrophoneRegularIcon />
        ) : undefined,
      [value]
    );
    return (
      <QueryButton
        target="pitch"
        menuType="filter"
        label={`Project Type`}
        icon={filterIcon}
        value={value}
        getOptionLabels={getPitchTypeFilterOptionLabels}
        getOptionIcons={handleGetOptionIcons}
        onOption={onOption}
      />
    );
  }
);

export default QueryTypeFilterButton;
