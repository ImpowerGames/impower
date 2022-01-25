import { MemberAccess } from "../../../impower-data-state";
import { ProjectDocument } from "../../../impower-data-store";
import {
  GameProjectData,
  InstanceData,
  Reference,
} from "../../../impower-game/data";

export const PROJECT_ACCESS = "PROJECT_ACCESS";
export interface ProjectAccessAction {
  type: typeof PROJECT_ACCESS;
  payload: {
    access: MemberAccess;
  };
}
export const projectAccess = (access: MemberAccess): ProjectAccessAction => {
  return {
    type: PROJECT_ACCESS,
    payload: {
      access,
    },
  };
};

export const PROJECT_VALIDATE = "PROJECT_VALIDATE";
export interface ProjectValidateAction {
  type: typeof PROJECT_VALIDATE;
}
export const projectValidate = (): ProjectValidateAction => {
  return {
    type: PROJECT_VALIDATE,
  };
};

export const PROJECT_VALIDATE_DATA = "PROJECT_VALIDATE_DATA";
export interface ProjectValidateDataAction {
  type: typeof PROJECT_VALIDATE_DATA;
  payload: {
    newData: InstanceData[];
  };
}
export const projectValidateData = (
  newData: InstanceData[]
): ProjectValidateDataAction => {
  return {
    type: PROJECT_VALIDATE_DATA,
    payload: {
      newData,
    },
  };
};

export const PROJECT_INSERT_DATA = "PROJECT_INSERT_DATA";
export interface ProjectInsertDataAction {
  type: typeof PROJECT_INSERT_DATA;
  payload: {
    newData: InstanceData[];
    description?: string;
    index?: number;
    skipSync?: boolean;
  };
}
export const projectInsertData = (
  newData: InstanceData[],
  description?: string,
  index?: number,
  skipSync?: boolean
): ProjectInsertDataAction => {
  return {
    type: PROJECT_INSERT_DATA,
    payload: {
      newData,
      description,
      index,
      skipSync,
    },
  };
};

export const PROJECT_REMOVE_DATA = "PROJECT_REMOVE_DATA";
export interface ProjectRemoveDataAction {
  type: typeof PROJECT_REMOVE_DATA;
  payload: {
    references: Reference[];
    description?: string;
    skipSync?: boolean;
  };
}
export const projectRemoveData = (
  references: Reference[],
  description?: string,
  skipSync?: boolean
): ProjectRemoveDataAction => {
  return {
    type: PROJECT_REMOVE_DATA,
    payload: {
      references,
      description,
      skipSync,
    },
  };
};

export const PROJECT_UPDATE_DATA = "PROJECT_UPDATE_DATA";
export interface ProjectUpdateDataAction {
  type: typeof PROJECT_UPDATE_DATA;
  payload: {
    description: string;
    references: Reference[];
    propertyPath: string;
    value: unknown;
  };
}
export const projectUpdateData = (
  description: string,
  references: Reference[],
  propertyPath: string,
  value: unknown
): ProjectUpdateDataAction => {
  return {
    type: PROJECT_UPDATE_DATA,
    payload: { description, references, propertyPath, value },
  };
};

export const PROJECT_CHANGE_DOCUMENT = "PROJECT_CHANGE_DOCUMENT";
export interface ProjectChangeDocumentAction {
  type: typeof PROJECT_CHANGE_DOCUMENT;
  payload: {
    id: string;
    doc: ProjectDocument;
    skipSync: boolean;
  };
}
export const projectChangeDocument = (
  id: string,
  doc: ProjectDocument,
  skipSync?: boolean
): ProjectChangeDocumentAction => {
  return {
    type: PROJECT_CHANGE_DOCUMENT,
    payload: { id, doc, skipSync },
  };
};

export const PROJECT_LOAD_DATA = "PROJECT_LOAD_DATA";
export interface ProjectLoadDataAction {
  type: typeof PROJECT_LOAD_DATA;
  payload: {
    id: string;
    data: GameProjectData;
  };
}
export const projectLoadData = (
  id: string,
  data: GameProjectData
): ProjectLoadDataAction => {
  return {
    type: PROJECT_LOAD_DATA,
    payload: { id, data },
  };
};

export const PROJECT_CHANGE_INSTANCE_DATA = "PROJECT_CHANGE_INSTANCE_DATA";
export interface ProjectChangeInstanceDataAction {
  type: typeof PROJECT_CHANGE_INSTANCE_DATA;
  payload: {
    id: string;
    change: "added" | "removed" | "modified" | "loaded";
    data: { [id: string]: InstanceData };
    skipSync: boolean;
  };
}
export const projectChangeInstanceData = (
  id: string,
  change: "added" | "removed" | "modified" | "loaded",
  data: { [id: string]: InstanceData },
  skipSync?: boolean
): ProjectChangeInstanceDataAction => {
  return {
    type: PROJECT_CHANGE_INSTANCE_DATA,
    payload: { id, change, data, skipSync },
  };
};

export type ProjectAction =
  | ProjectAccessAction
  | ProjectValidateAction
  | ProjectValidateDataAction
  | ProjectInsertDataAction
  | ProjectRemoveDataAction
  | ProjectUpdateDataAction
  | ProjectChangeDocumentAction
  | ProjectLoadDataAction
  | ProjectChangeInstanceDataAction;
