import Alien8bitRegularIcon from "../../../../resources/icons/regular/alien-8bit.svg";
import GamepadModernRegularIcon from "../../../../resources/icons/regular/gamepad-modern.svg";
import GearRegularIcon from "../../../../resources/icons/regular/gear.svg";
import HeadSideBrainRegularIcon from "../../../../resources/icons/regular/head-side-brain.svg";
import PhotoFilmRegularIcon from "../../../../resources/icons/regular/photo-film.svg";
import Alien8bitSolidIcon from "../../../../resources/icons/solid/alien-8bit.svg";
import GamepadModernSolidIcon from "../../../../resources/icons/solid/gamepad-modern.svg";
import GearSolidIcon from "../../../../resources/icons/solid/gear.svg";
import HeadSideBrainSolidIcon from "../../../../resources/icons/solid/head-side-brain.svg";
import PhotoFilmSolidIcon from "../../../../resources/icons/solid/photo-film.svg";
import { ButtonInfo } from "../../../impower-route";
import { WindowType } from "../state/windowState";

export interface WindowInfo extends ButtonInfo {
  type: WindowType;
}

export const windows: WindowInfo[] = [
  {
    type: "setup",
    name: "Setup",
    iconOn: GearSolidIcon,
    iconOff: GearRegularIcon,
  },
  {
    type: "assets",
    name: "Assets",
    iconOn: PhotoFilmSolidIcon,
    iconOff: PhotoFilmRegularIcon,
  },
  {
    type: "entities",
    name: "Entities",
    iconOn: Alien8bitSolidIcon,
    iconOff: Alien8bitRegularIcon,
  },
  {
    type: "logic",
    name: "Logic",
    iconOn: HeadSideBrainSolidIcon,
    iconOff: HeadSideBrainRegularIcon,
  },
  {
    type: "test",
    name: "Test",
    iconOn: GamepadModernSolidIcon,
    iconOff: GamepadModernRegularIcon,
  },
];
