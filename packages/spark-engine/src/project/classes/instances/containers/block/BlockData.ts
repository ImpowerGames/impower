import { Positionable } from "../../../../../data/interfaces/Positionable";
import { BlockReference } from "../../../../../data/interfaces/references/BlockReference";
import { ContainerData } from "../../container/ContainerData";
import { CommandData } from "../../items/command/CommandData";

export interface BlockData
  extends ContainerData<"Block", BlockReference>,
    Positionable {
  commands: Record<string, CommandData>;
}
