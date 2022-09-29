import { Collection } from "../../../data/interfaces/Collection";
import { ConfigData } from "../instances/config/ConfigData";
import { ConfigTypeId } from "../instances/config/ConfigTypeId";
import { AdvancedConfigData } from "../instances/configs/advancedConfig/AdvancedConfigData";
import { BackgroundConfigData } from "../instances/configs/backgroundConfig/BackgroundConfigData";
import { DebugConfigData } from "../instances/configs/debugConfig/DebugConfigData";
import { PhysicsConfigData } from "../instances/configs/physicsConfig/PhysicsConfigData";
import { SaveConfigData } from "../instances/configs/saveConfig/SaveConfigData";
import { ScaleConfigData } from "../instances/configs/scaleConfig/ScaleConfigData";
import {
  InstancesCollection,
  ProjectData,
  ScriptsCollection,
} from "./ProjectData";

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
}

export interface GameProjectData extends ProjectData {
  scripts?: ScriptsCollection;
  instances?: GameInstancesCollection;
}
