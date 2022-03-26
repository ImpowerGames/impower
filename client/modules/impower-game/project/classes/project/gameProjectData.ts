import { Collection } from "../../../../impower-core";
import { ConfigData } from "../instances/config/configData";
import { ConfigTypeId } from "../instances/config/configTypeId";
import { AdvancedConfigData } from "../instances/configs/advancedConfig/advancedConfigData";
import { BackgroundConfigData } from "../instances/configs/backgroundConfig/backgroundConfigData";
import { DebugConfigData } from "../instances/configs/debugConfig/debugConfigData";
import { PhysicsConfigData } from "../instances/configs/physicsConfig/physicsConfigData";
import { SaveConfigData } from "../instances/configs/saveConfig/saveConfigData";
import { ScaleConfigData } from "../instances/configs/scaleConfig/scaleConfigData";
import { BlockData } from "../instances/containers/block/blockData";
import {
  InstancesCollection,
  ProjectData,
  ScriptsCollection,
} from "./projectData";

export interface ConfigDataCollection
  extends Collection<ConfigData, ConfigTypeId> {
  data: {
    ScaleConfig: ScaleConfigData;
    BackgroundConfig: BackgroundConfigData;
    SaveConfig: SaveConfigData;
    PhysicsConfig: PhysicsConfigData;
    DebugConfig: DebugConfigData;
    AdvancedConfig: AdvancedConfigData;
  };
}

export interface GameInstancesCollection extends InstancesCollection {
  configs: ConfigDataCollection;
  blocks: Collection<BlockData>;
}

export interface GameProjectData extends ProjectData {
  scripts?: ScriptsCollection;
  instances?: GameInstancesCollection;
}
