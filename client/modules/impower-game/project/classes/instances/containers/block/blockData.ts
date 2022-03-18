import { OrderedCollection } from "../../../../../../impower-core";
import { Positionable } from "../../../../../data/interfaces/positionable";
import { BlockReference } from "../../../../../data/interfaces/references/blockReference";
import { ContainerData } from "../../container/containerData";
import { CommandData } from "../../items/command/commandData";

export interface BlockData
  extends ContainerData<"Block", BlockReference>,
    Positionable {
  operator: "*" | "?" | "";
  ids: Record<string, string>;
  triggers: string[];
  parameters: string[];
  commands: OrderedCollection<CommandData>;
}
