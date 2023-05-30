import {
    FilesCollection,
    GameInstancesCollection,
    InstanceData,
    Reference,
    ScriptsCollection,
} from "../../../../../spark-engine";
import { MemberAccess } from "../../../impower-data-state";
import { ProjectDocument } from "../../../impower-data-store";
import { MembersCollection } from "../state/collaborativeGameProjectData";

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

export const PROJECT_INSERT_DATA = "PROJECT_INSERT_DATA";
export interface ProjectInsertDataAction {
  type: typeof PROJECT_INSERT_DATA;
  payload: {
    newData: InstanceData[];
    index?: number;
    skipSync?: boolean;
  };
}
export const projectInsertData = (
  newData: InstanceData[],
  index?: number,
  skipSync?: boolean
): ProjectInsertDataAction => {
  return {
    type: PROJECT_INSERT_DATA,
    payload: {
      newData,
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
    skipSync?: boolean;
  };
}
export const projectRemoveData = (
  references: Reference[],
  skipSync?: boolean
): ProjectRemoveDataAction => {
  return {
    type: PROJECT_REMOVE_DATA,
    payload: {
      references,
      skipSync,
    },
  };
};

export const PROJECT_UPDATE_DATA = "PROJECT_UPDATE_DATA";
export interface ProjectUpdateDataAction {
  type: typeof PROJECT_UPDATE_DATA;
  payload: {
    references: Reference[];
    propertyPath: string;
    value: unknown;
  };
}
export const projectUpdateData = (
  references: Reference[],
  propertyPath: string,
  value: unknown
): ProjectUpdateDataAction => {
  return {
    type: PROJECT_UPDATE_DATA,
    payload: { references, propertyPath, value },
  };
};

export const PROJECT_CHANGE_SCRIPT = "PROJECT_CHANGE_SCRIPT";
export interface ProjectChangeScriptAction {
  type: typeof PROJECT_CHANGE_SCRIPT;
  payload: {
    id: string;
    type: string;
    script: string;
    skipSync: boolean;
  };
}
export const projectChangeScript = (
  id: string,
  type: string,
  script: string,
  skipSync?: boolean
): ProjectChangeScriptAction => {
  return {
    type: PROJECT_CHANGE_SCRIPT,
    payload: { id, type, script, skipSync },
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

export const PROJECT_LOAD_DOC = "PROJECT_LOAD_DOC";
export interface ProjectLoadDocAction {
  type: typeof PROJECT_LOAD_DOC;
  payload: {
    id: string;
    doc: ProjectDocument;
  };
}
export const projectLoadDoc = (
  id: string,
  doc: ProjectDocument
): ProjectLoadDocAction => {
  return {
    type: PROJECT_LOAD_DOC,
    payload: { id, doc },
  };
};

export const PROJECT_LOAD_MEMBERS = "PROJECT_LOAD_MEMBERS";
export interface ProjectLoadMembersAction {
  type: typeof PROJECT_LOAD_MEMBERS;
  payload: {
    id: string;
    members: MembersCollection;
  };
}
export const projectLoadMembers = (
  id: string,
  members: MembersCollection
): ProjectLoadMembersAction => {
  return {
    type: PROJECT_LOAD_MEMBERS,
    payload: { id, members },
  };
};

export const PROJECT_LOAD_SCRIPTS = "PROJECT_LOAD_SCRIPTS";
export interface ProjectLoadScriptsAction {
  type: typeof PROJECT_LOAD_SCRIPTS;
  payload: {
    id: string;
    scripts: ScriptsCollection;
  };
}
export const projectLoadScripts = (
  id: string,
  scripts: ScriptsCollection
): ProjectLoadScriptsAction => {
  return {
    type: PROJECT_LOAD_SCRIPTS,
    payload: { id, scripts },
  };
};

export const PROJECT_LOAD_FILES = "PROJECT_LOAD_FILES";
export interface ProjectLoadFilesAction {
  type: typeof PROJECT_LOAD_FILES;
  payload: {
    id: string;
    files: FilesCollection;
  };
}
export const projectLoadFiles = (
  id: string,
  files: FilesCollection
): ProjectLoadFilesAction => {
  return {
    type: PROJECT_LOAD_FILES,
    payload: { id, files },
  };
};

export const PROJECT_LOAD_INSTANCES = "PROJECT_LOAD_INSTANCES";
export interface ProjectLoadInstancesAction {
  type: typeof PROJECT_LOAD_INSTANCES;
  payload: {
    id: string;
    instances: GameInstancesCollection;
  };
}
export const projectLoadInstances = (
  id: string,
  instances: GameInstancesCollection
): ProjectLoadInstancesAction => {
  return {
    type: PROJECT_LOAD_INSTANCES,
    payload: { id, instances },
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
  | ProjectInsertDataAction
  | ProjectRemoveDataAction
  | ProjectUpdateDataAction
  | ProjectChangeDocumentAction
  | ProjectLoadDocAction
  | ProjectLoadMembersAction
  | ProjectLoadFilesAction
  | ProjectLoadScriptsAction
  | ProjectLoadInstancesAction
  | ProjectChangeInstanceDataAction
  | ProjectChangeScriptAction;
