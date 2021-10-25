import Alien8bitRegularIcon from "../../../../resources/icons/regular/alien-8bit.svg";
import EyeRegularIcon from "../../../../resources/icons/regular/eye.svg";
import GamepadModernRegularIcon from "../../../../resources/icons/regular/gamepad-modern.svg";
import GearRegularIcon from "../../../../resources/icons/regular/gear.svg";
import HeadSideBrainRegularIcon from "../../../../resources/icons/regular/head-side-brain.svg";
import PhotoFilmRegularIcon from "../../../../resources/icons/regular/photo-film.svg";
import Alien8bitSolidIcon from "../../../../resources/icons/solid/alien-8bit.svg";
import EyeSolidIcon from "../../../../resources/icons/solid/eye.svg";
import GamepadModernSolidIcon from "../../../../resources/icons/solid/gamepad-modern.svg";
import GearSolidIcon from "../../../../resources/icons/solid/gear.svg";
import HeadSideBrainSolidIcon from "../../../../resources/icons/solid/head-side-brain.svg";
import PhotoFilmSolidIcon from "../../../../resources/icons/solid/photo-film.svg";
import { ButtonInfo } from "../../../impower-route";
import { WindowType } from "../state/windowState";

export interface WindowInfo extends ButtonInfo {
  type: WindowType;
}

export const gameWindows: WindowInfo[] = [
  {
    type: WindowType.Setup,
    name: "Setup",
    iconOn: GearSolidIcon,
    iconOff: GearRegularIcon,
  },
  {
    type: WindowType.Assets,
    name: "Assets",
    iconOn: PhotoFilmSolidIcon,
    iconOff: PhotoFilmRegularIcon,
  },
  {
    type: WindowType.Entities,
    name: "Entities",
    iconOn: Alien8bitSolidIcon,
    iconOff: Alien8bitRegularIcon,
  },
  {
    type: WindowType.Logic,
    name: "Logic",
    iconOn: HeadSideBrainSolidIcon,
    iconOff: HeadSideBrainRegularIcon,
  },
  {
    type: WindowType.Test,
    name: "Test",
    iconOn: GamepadModernSolidIcon,
    iconOff: GamepadModernRegularIcon,
  },
];

export const resourceWindows: WindowInfo[] = [
  {
    type: WindowType.Setup,
    name: "Setup",
    iconOn: GearSolidIcon,
    iconOff: GearRegularIcon,
  },
  {
    type: WindowType.Assets,
    name: "Assets",
    iconOn: PhotoFilmSolidIcon,
    iconOff: PhotoFilmRegularIcon,
  },
  {
    type: WindowType.Test,
    name: "Preview",
    iconOn: EyeSolidIcon,
    iconOff: EyeRegularIcon,
  },
];
