import { Positionable } from "../../../../../data/interfaces/Positionable";
import { BlockReference } from "../../../../../data/interfaces/references/BlockReference";
import { ContainerData } from "../../container/ContainerData";
import { CommandData } from "../../items/command/CommandData";

export interface BlockData
  extends ContainerData<"Block", BlockReference>,
    Positionable {
  type: "section" | "function" | "method" | "detector";
  ids: Record<string, string>;
  triggers: string[];
  parameters: string[];
  commands: Record<string, CommandData>;
}
