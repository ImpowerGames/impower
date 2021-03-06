import CircleInfoRegularIcon from "../../../../resources/icons/regular/circle-info.svg";
import FloppyDiskRegularIcon from "../../../../resources/icons/regular/floppy-disk.svg";
import GamepadModernRegularIcon from "../../../../resources/icons/regular/gamepad-modern.svg";
import LayerGroupRegularIcon from "../../../../resources/icons/regular/layer-group.svg";
import ListUlRegularIcon from "../../../../resources/icons/regular/list-ul.svg";
import CircleInfoSolidIcon from "../../../../resources/icons/solid/circle-info.svg";
import FloppyDiskSolidIcon from "../../../../resources/icons/solid/floppy-disk.svg";
import GamepadModernSolidIcon from "../../../../resources/icons/solid/gamepad-modern.svg";
import LayerGroupSolidIcon from "../../../../resources/icons/solid/layer-group.svg";
import ListUlSolidIcon from "../../../../resources/icons/solid/list-ul.svg";
import { ButtonInfo } from "../../../impower-route";
import { PanelType } from "../state/windowState";

export interface PanelInfo extends ButtonInfo {
  type: PanelType;
}

export const panels: PanelInfo[] = [
  {
    type: PanelType.Setup,
    name: "Project",
    iconOn: FloppyDiskSolidIcon,
    iconOff: FloppyDiskRegularIcon,
  },
  {
    type: PanelType.Container,
    name: "Container",
    iconOn: LayerGroupSolidIcon,
    iconOff: LayerGroupRegularIcon,
  },
  {
    type: PanelType.Item,
    name: "Item",
    iconOn: ListUlSolidIcon,
    iconOff: ListUlRegularIcon,
  },
  {
    type: PanelType.Detail,
    name: "Detail",
    iconOn: CircleInfoSolidIcon,
    iconOff: CircleInfoRegularIcon,
  },
  {
    type: PanelType.Test,
    name: "Test",
    iconOn: GamepadModernSolidIcon,
    iconOff: GamepadModernRegularIcon,
  },
];
