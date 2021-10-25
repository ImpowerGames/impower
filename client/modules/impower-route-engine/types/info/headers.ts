import BoltRegularIcon from "../../../../resources/icons/regular/bolt.svg";
import CubeRegularIcon from "../../../../resources/icons/regular/cube.svg";
import EyeRegularIcon from "../../../../resources/icons/regular/eye.svg";
import GearRegularIcon from "../../../../resources/icons/regular/gear.svg";
import ShapesRegularIcon from "../../../../resources/icons/regular/shapes.svg";
import SquareRegularIcon from "../../../../resources/icons/regular/square.svg";
import SubscriptRegularIcon from "../../../../resources/icons/regular/subscript.svg";
import WandMagicSparklesRegularIcon from "../../../../resources/icons/regular/wand-magic-sparkles.svg";
import BoltSolidIcon from "../../../../resources/icons/solid/bolt.svg";
import CubeSolidIcon from "../../../../resources/icons/solid/cube.svg";
import EyeSolidIcon from "../../../../resources/icons/solid/eye.svg";
import GearSolidIcon from "../../../../resources/icons/solid/gear.svg";
import ShapesSolidIcon from "../../../../resources/icons/solid/shapes.svg";
import SquareSolidIcon from "../../../../resources/icons/solid/square.svg";
import SubscriptSolidIcon from "../../../../resources/icons/solid/subscript.svg";
import WandMagicSparklesSolidIcon from "../../../../resources/icons/solid/wand-magic-sparkles.svg";
import {
  ContainerType,
  ItemSectionType,
  ItemType,
  SetupSectionType,
} from "../../../impower-game/data";
import { ButtonInfo } from "../../../impower-route";

export type HeaderType =
  | ContainerType
  | ItemType
  | ItemSectionType
  | SetupSectionType;

export interface HeaderInfo extends ButtonInfo {
  type: HeaderType;
  pluralName: string;
  subheading?: string;
}

export const constructHeader: HeaderInfo = {
  type: ContainerType.Construct,
  name: "Construct",
  pluralName: "Constructs",
  iconOn: CubeSolidIcon,
  iconOff: CubeRegularIcon,
};

export const blockHeader: HeaderInfo = {
  type: ContainerType.Block,
  name: "Block",
  pluralName: "Blocks",
  iconOn: SquareSolidIcon,
  iconOff: SquareRegularIcon,
};

export const elementHeader: HeaderInfo = {
  type: ItemType.Element,
  name: "Element",
  pluralName: "Elements",
  iconOn: ShapesSolidIcon,
  iconOff: ShapesRegularIcon,
};

export const variableHeader: HeaderInfo = {
  type: ItemType.Variable,
  name: "Variable",
  pluralName: "Variables",
  iconOn: SubscriptSolidIcon,
  iconOff: SubscriptRegularIcon,
};

export const triggerHeader: HeaderInfo = {
  type: ItemType.Trigger,
  name: "Trigger",
  pluralName: "Triggers",
  iconOn: BoltSolidIcon,
  iconOff: BoltRegularIcon,
};

export const commandHeader: HeaderInfo = {
  type: ItemType.Command,
  name: "Command",
  pluralName: "Commands",
  iconOn: WandMagicSparklesSolidIcon,
  iconOff: WandMagicSparklesRegularIcon,
};

export const previewHeader: HeaderInfo = {
  type: ItemSectionType.Preview,
  name: "Canvas",
  pluralName: "Preview",
  iconOn: EyeSolidIcon,
  iconOff: EyeRegularIcon,
};

export const gameSetupHeader: HeaderInfo = {
  type: SetupSectionType.Details,
  name: "Details",
  pluralName: "Details",
  iconOn: GearSolidIcon,
  iconOff: GearRegularIcon,
};

export const projectSetupHeader: HeaderInfo = {
  type: SetupSectionType.Configuration,
  name: "Configuration",
  pluralName: "Configuration",
  iconOn: GearSolidIcon,
  iconOff: GearRegularIcon,
};

export const accessSetupHeader: HeaderInfo = {
  type: SetupSectionType.Access,
  name: "Access",
  pluralName: "Access",
  iconOn: GearSolidIcon,
  iconOff: GearRegularIcon,
};

export const getHeader = (headerType: HeaderType): HeaderInfo => {
  switch (headerType) {
    case ContainerType.Construct:
      return constructHeader;
    case ContainerType.Block:
      return blockHeader;
    case ItemType.Element:
      return elementHeader;
    case ItemType.Variable:
      return variableHeader;
    case ItemType.Trigger:
      return triggerHeader;
    case ItemType.Command:
      return commandHeader;
    case ItemSectionType.Preview:
      return previewHeader;
    case SetupSectionType.Details:
      return gameSetupHeader;
    case SetupSectionType.Configuration:
      return projectSetupHeader;
    case SetupSectionType.Access:
      return accessSetupHeader;
    default:
      throw new Error("HeaderType not recognized");
  }
};
