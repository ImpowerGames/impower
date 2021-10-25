import { Collection } from "../../../../impower-core";
import { createConstructReference } from "../../../data/interfaces/references/constructReference";
import { createBlockReference } from "../../../data/interfaces/references/blockReference";
import { ConfigTypeId } from "../instances/config/configTypeId";
import {
  createScaleConfigData,
  ScaleConfigData,
} from "../instances/configs/scaleConfig/scaleConfigData";
import {
  BackgroundConfigData,
  createBackgroundConfigData,
} from "../instances/configs/backgroundConfig/backgroundConfigData";
import {
  createAdvancedConfigData,
  AdvancedConfigData,
} from "../instances/configs/advancedConfig/advancedConfigData";
import {
  createSaveConfigData,
  SaveConfigData,
} from "../instances/configs/saveConfig/saveConfigData";
import {
  createPhysicsConfigData,
  PhysicsConfigData,
} from "../instances/configs/physicsConfig/physicsConfigData";
import {
  createDebugConfigData,
  DebugConfigData,
} from "../instances/configs/debugConfig/debugConfigData";
import {
  ConstructData,
  createConstructData,
} from "../instances/containers/construct/constructData";
import {
  BlockData,
  createBlockData,
} from "../instances/containers/block/blockData";
import { ContainerType } from "../../../data/enums/data";
import { ConfigData } from "../instances/config/configData";
import { createProjectData, isProjectData, ProjectData } from "./projectData";
import { FileData } from "../instances/file/fileData";
import { FolderData } from "../instances/folder/folderData";

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
              refId: ContainerType.Construct,
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
              refId: ContainerType.Block,
            }),
            name: "Root",
          }),
        },
      },
    },
  },
  ...obj,
});

export const isGameProjectData = (obj: unknown): obj is GameProjectData => {
  if (!obj) {
    return false;
  }
  const projectData = obj as GameProjectData;
  return (
    isProjectData(obj) &&
    projectData?.instances?.constructs !== undefined &&
    projectData?.instances?.blocks !== undefined
  );
};
