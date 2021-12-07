import BookOpenRegularIcon from "../../../resources/icons/regular/book-open.svg";
import FilterRegularIcon from "../../../resources/icons/regular/filter.svg";
import GamepadRegularIcon from "../../../resources/icons/regular/gamepad.svg";
import HouseRegularIcon from "../../../resources/icons/regular/house.svg";
import MicrophoneRegularIcon from "../../../resources/icons/regular/microphone.svg";
import MusicRegularIcon from "../../../resources/icons/regular/music.svg";
import UserRegularIcon from "../../../resources/icons/regular/user.svg";
import WaveformRegularIcon from "../../../resources/icons/regular/waveform.svg";
import BookOpenSolidIcon from "../../../resources/icons/solid/book-open.svg";
import FilterSolidIcon from "../../../resources/icons/solid/filter.svg";
import GamepadSolidIcon from "../../../resources/icons/solid/gamepad.svg";
import HouseSolidIcon from "../../../resources/icons/solid/house.svg";
import MicrophoneSolidIcon from "../../../resources/icons/solid/microphone.svg";
import MusicSolidIcon from "../../../resources/icons/solid/music.svg";
import UserSolidIcon from "../../../resources/icons/solid/user.svg";
import WaveformSolidIcon from "../../../resources/icons/solid/waveform.svg";
import { ProjectTypeFilter } from "../types/projectTypeFilter";

const getPitchTypeFilterOptionIcons = (
  filter: ProjectTypeFilter
): {
  [filter in ProjectTypeFilter]: React.ComponentType;
} => ({
  all: filter === "all" ? FilterSolidIcon : FilterRegularIcon,
  game: filter === "game" ? GamepadSolidIcon : GamepadRegularIcon,
  story: filter === "story" ? BookOpenSolidIcon : BookOpenRegularIcon,
  character: filter === "character" ? UserSolidIcon : UserRegularIcon,
  environment: filter === "environment" ? HouseSolidIcon : HouseRegularIcon,
  music: filter === "music" ? MusicSolidIcon : MusicRegularIcon,
  sound: filter === "sound" ? WaveformSolidIcon : WaveformRegularIcon,
  voice: filter === "voice" ? MicrophoneSolidIcon : MicrophoneRegularIcon,
});

export default getPitchTypeFilterOptionIcons;
