import {
    ConfigData,
    GameProjectData,
    InstanceData,
    Reference,
} from "../../../../spark-engine";

const getNestedDataInternal = (
  dict: { [refId: string]: InstanceData },
  reference: Reference,
  project: GameProjectData
): void => {
  if (!reference) {
    throw new Error(`No reference specified`);
  }
  if (!reference.refId) {
    return;
  }
  switch (reference.refType) {
    case "Config": {
      const config: ConfigData =
        project?.instances?.configs.data[reference.refId];
      if (config) {
        dict[reference.refId] = config;
      }
      break;
    }
    default:
      break;
  }
};

const getAllNestedDataInternal = (
  dict: { [refId: string]: InstanceData },
  references: Reference[],
  project: GameProjectData
): void => {
  references.forEach((reference) => {
    getNestedDataInternal(dict, reference, project);
  });
};

export const getAllNestedData = (
  references: Reference[],
  project: GameProjectData
): { [refId: string]: InstanceData } => {
  const dict: { [refId: string]: InstanceData } = {};
  getAllNestedDataInternal(dict, references, project);
  return dict;
};
