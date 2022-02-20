import { Collection } from "../../../../impower-core";
import { createBlockReference } from "../../../data/interfaces/references/blockReference";
import { createConstructReference } from "../../../data/interfaces/references/constructReference";
import { ConfigData } from "../instances/config/configData";
import { ConfigTypeId } from "../instances/config/configTypeId";
import {
  AdvancedConfigData,
  createAdvancedConfigData,
} from "../instances/configs/advancedConfig/advancedConfigData";
import {
  BackgroundConfigData,
  createBackgroundConfigData,
} from "../instances/configs/backgroundConfig/backgroundConfigData";
import {
  createDebugConfigData,
  DebugConfigData,
} from "../instances/configs/debugConfig/debugConfigData";
import {
  createPhysicsConfigData,
  PhysicsConfigData,
} from "../instances/configs/physicsConfig/physicsConfigData";
import {
  createSaveConfigData,
  SaveConfigData,
} from "../instances/configs/saveConfig/saveConfigData";
import {
  createScaleConfigData,
  ScaleConfigData,
} from "../instances/configs/scaleConfig/scaleConfigData";
import {
  BlockData,
  createBlockData,
} from "../instances/containers/block/blockData";
import {
  ConstructData,
  createConstructData,
} from "../instances/containers/construct/constructData";
import { FileData } from "../instances/file/fileData";
import { FolderData } from "../instances/folder/folderData";
import { createProjectData, ProjectData } from "./projectData";

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

export const createConfigDataCollection = (
  obj?: Partial<ConfigDataCollection>
): ConfigDataCollection => ({
  data: {
    ScaleConfig: createScaleConfigData(),
    BackgroundConfig: createBackgroundConfigData(),
    SaveConfig: createSaveConfigData(),
    PhysicsConfig: createPhysicsConfigData(),
    DebugConfig: createDebugConfigData(),
    AdvancedConfig: createAdvancedConfigData(),
  },
  ...obj,
});

export interface GameProjectData extends ProjectData {
  scripts?: {
    setup?: Collection<string>;
    assets?: Collection<string>;
    entities?: Collection<string>;
    logic?: Collection<string>;
  };
  instances?: {
    files: Collection<FileData>;
    folders: Collection<FolderData>;
    configs: ConfigDataCollection;
    constructs: Collection<ConstructData>;
    blocks: Collection<BlockData>;
  };
}

export const createGameProjectData = (
  obj?: Partial<GameProjectData>
): GameProjectData => ({
  ...createProjectData(obj),
  instances: {
    configs: createConfigDataCollection(),
    files: { data: {} },
    folders: { data: {} },
    constructs: {
      data: {
        Construct: {
          ...createConstructData({
            reference: createConstructReference({
              refId: "Construct",
            }),
            name: "Root",
          }),
        },
      },
    },
    blocks: {
      data: {
        Block: {
          ...createBlockData({
            reference: createBlockReference({
              refId: "Block",
            }),
            name: "Root",
          }),
        },
      },
    },
  },
  ...obj,
});
