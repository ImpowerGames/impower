import {
  FilesCollection,
  GameInstancesCollection,
  InstanceData,
  Reference,
  ScriptsCollection,
} from "../../../../../spark-engine";
import setValue from "../../../impower-core/utils/setValue";
import { MemberAccess } from "../../../impower-data-state";
import { ProjectDocument } from "../../../impower-data-store";
import { ProjectEngineSync } from "../../../impower-project-engine-sync";
import { createProjectState } from "../../utils/createProjectState";
import { getData } from "../../utils/getData";
import { insertGameProjectData } from "../../utils/insertGameProjectData";
import { removeGameProjectData } from "../../utils/removeGameProjectData";
import { validateData } from "../../utils/validateData";
import {
  ProjectAction,
  PROJECT_ACCESS,
  PROJECT_CHANGE_DOCUMENT,
  PROJECT_CHANGE_INSTANCE_DATA,
  PROJECT_CHANGE_SCRIPT,
  PROJECT_INSERT_DATA,
  PROJECT_LOAD_DOC,
  PROJECT_LOAD_FILES,
  PROJECT_LOAD_INSTANCES,
  PROJECT_LOAD_MEMBERS,
  PROJECT_LOAD_SCRIPTS,
  PROJECT_REMOVE_DATA,
  PROJECT_UPDATE_DATA,
} from "../actions/projectActions";
import { MembersCollection } from "../state/collaborativeGameProjectData";
import { ProjectState } from "../state/projectState";

const doProjectAccess = (
  state: ProjectState,
  payload: {
    access: MemberAccess;
  }
): ProjectState => {
  const { access } = payload;
  return {
    ...state,
    access,
  };
};

const doProjectInsertData = (
  state: ProjectState,
  payload: {
    newData: InstanceData[];
    index?: number;
    skipSync?: boolean;
  }
): ProjectState => {
  const { newData, skipSync } = payload;

  const firstData = newData[0];
  if (!firstData) {
    return state;
  }

  const { newProject } = insertGameProjectData(
    state.data,
    newData,
    validateData
  );

  if (!skipSync) {
    ProjectEngineSync.instance.syncData(
      newProject,
      state.data,
      "projects",
      state.id
    );
  }

  return {
    ...state,
    data: {
      ...state.data,
      ...newProject,
    },
  };
};

const doProjectRemoveData = (
  state: ProjectState,
  payload: {
    references: Reference[];
    skipSync?: boolean;
  }
): ProjectState => {
  const { references, skipSync } = payload;

  const firstReference = references[0];
  if (!firstReference) {
    return state;
  }

  const firstData = getData(firstReference, state.data);
  if (!firstData) {
    return state;
  }

  const { newProject } = removeGameProjectData(state.data, references);

  if (!skipSync) {
    ProjectEngineSync.instance.syncData(
      newProject,
      state.data,
      "projects",
      state.id
    );
  }

  return {
    ...state,
    data: {
      ...state.data,
      ...newProject,
    },
  };
};

const doProjectUpdateData = (
  state: ProjectState,
  payload: {
    references: Reference[];
    propertyPath: string;
    value: unknown;
  }
): ProjectState => {
  const { references, propertyPath, value } = payload;

  const project = state.data;
  const newData = references.map((r) => {
    const d = getData(r, project);
    if (!d) {
      throw new Error(`Invalid Reference: ${JSON.stringify(r)}`);
    }
    return setValue(d, propertyPath, value);
  }) as InstanceData[];

  return doProjectInsertData(state, { newData });
};

const doProjectChangeDocument = (
  state: ProjectState,
  payload: {
    id: string;
    doc: ProjectDocument;
    skipSync: boolean;
  }
): ProjectState => {
  const { id, doc, skipSync } = payload;

  if (!skipSync && id) {
    ProjectEngineSync.instance.syncDoc(doc, "projects", id);
  }
  return {
    ...state,
    id,
    data: {
      ...(state.data || {}),
      doc,
    },
  };
  return state;
};

const doProjectChangeScript = (
  state: ProjectState,
  payload: {
    id: string;
    type: string;
    script: string;
    skipSync: boolean;
  }
): ProjectState => {
  const { id, type, script, skipSync } = payload;

  if (!skipSync && id) {
    ProjectEngineSync.instance.syncScript(
      script,
      "projects",
      id,
      "scripts",
      "data",
      type
    );
  }
  return {
    ...state,
    id,
    data: {
      ...(state?.data || {}),
      scripts: {
        ...(state?.data?.scripts || {}),
        data: {
          ...(state?.data?.scripts?.data || {}),
          [type]: script,
        },
      },
    },
  };
  return state;
};

const doProjectChangeInstanceData = (
  state: ProjectState,
  payload: {
    id: string;
    change: "added" | "removed" | "modified" | "loaded";
    data: { [id: string]: InstanceData };
    skipSync: boolean;
  }
): ProjectState => {
  const { id, change, data, skipSync } = payload;

  if (!data) {
    return state;
  }

  if (change === "removed") {
    return doProjectRemoveData(
      { ...state, id },
      {
        references: Object.values(data).map((d) => d.reference),
        skipSync,
      }
    );
  }
  if (change === "added") {
    return doProjectInsertData(
      { ...state, id },
      {
        newData: Object.values(data).map((d) => d),
        skipSync,
      }
    );
  }
  if (change === "modified") {
    return doProjectInsertData(
      { ...state, id },
      {
        newData: Object.values(data).map((d) => d),
        skipSync,
      }
    );
  }
  if (change === "loaded") {
    return doProjectInsertData(
      { ...state, id },
      {
        newData: Object.values(data).map((d) => d),
      }
    );
  }
  return state;
};

const doProjectLoadDoc = (
  state: ProjectState,
  payload: {
    id: string;
    doc: ProjectDocument;
  }
): ProjectState => {
  const { id, doc } = payload;
  return {
    ...state,
    id,
    data: {
      ...state.data,
      doc,
    },
  };
};

const doProjectLoadMembers = (
  state: ProjectState,
  payload: {
    id: string;
    members: MembersCollection;
  }
): ProjectState => {
  const { id, members } = payload;
  return {
    ...state,
    id,
    data: {
      ...state.data,
      members,
    },
  };
};

const doProjectLoadFiles = (
  state: ProjectState,
  payload: {
    id: string;
    files: FilesCollection;
  }
): ProjectState => {
  const { id, files } = payload;
  return {
    ...state,
    id,
    data: {
      ...state.data,
      files,
    },
  };
};

const doProjectLoadScripts = (
  state: ProjectState,
  payload: {
    id: string;
    scripts: ScriptsCollection;
  }
): ProjectState => {
  const { id, scripts } = payload;
  return {
    ...state,
    id,
    data: {
      ...state.data,
      scripts,
    },
  };
};

const doProjectLoadInstances = (
  state: ProjectState,
  payload: {
    id: string;
    instances: GameInstancesCollection;
  }
): ProjectState => {
  const { id, instances } = payload;
  return {
    ...state,
    id,
    data: {
      ...state.data,
      instances,
    },
  };
};

export const projectReducer = (
  state = createProjectState(),
  action: ProjectAction = undefined
): ProjectState => {
  switch (action.type) {
    case PROJECT_ACCESS:
      return doProjectAccess(state, action.payload);
    case PROJECT_INSERT_DATA:
      return doProjectInsertData(state, action.payload);
    case PROJECT_REMOVE_DATA:
      return doProjectRemoveData(state, action.payload);
    case PROJECT_UPDATE_DATA:
      return doProjectUpdateData(state, action.payload);
    case PROJECT_CHANGE_DOCUMENT:
      return doProjectChangeDocument(state, action.payload);
    case PROJECT_CHANGE_SCRIPT:
      return doProjectChangeScript(state, action.payload);
    case PROJECT_LOAD_DOC:
      return doProjectLoadDoc(state, action.payload);
    case PROJECT_LOAD_MEMBERS:
      return doProjectLoadMembers(state, action.payload);
    case PROJECT_LOAD_FILES:
      return doProjectLoadFiles(state, action.payload);
    case PROJECT_LOAD_SCRIPTS:
      return doProjectLoadScripts(state, action.payload);
    case PROJECT_LOAD_INSTANCES:
      return doProjectLoadInstances(state, action.payload);
    case PROJECT_CHANGE_INSTANCE_DATA:
      return doProjectChangeInstanceData(state, action.payload);
    default:
      return state;
  }
};
