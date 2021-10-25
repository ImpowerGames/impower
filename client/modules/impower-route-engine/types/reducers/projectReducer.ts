import {
  InstanceData,
  GameProjectData,
  Reference,
  isGameProjectData,
  ResourceProjectData,
} from "../../../impower-game/data";
import {
  ImpowerGameInspector,
  getData,
  insertGameProjectData,
  removeGameProjectData,
} from "../../../impower-game/inspector";
import {
  ProjectAction,
  PROJECT_VALIDATE,
  PROJECT_VALIDATE_DATA,
  PROJECT_INSERT_DATA,
  PROJECT_REMOVE_DATA,
  PROJECT_UPDATE_DATA,
  PROJECT_CHANGE_DOCUMENT,
  PROJECT_CHANGE_INSTANCE_DATA,
  PROJECT_ACCESS,
  PROJECT_LOAD_DATA,
} from "../actions/projectActions";
import { createProjectState, ProjectState } from "../state/projectState";
import { ProjectEngineSync } from "../../../impower-project-engine-sync";
import { GameDocument, ResourceDocument } from "../../../impower-data-store";
import { MemberAccess } from "../../../impower-data-state";
import setValue from "../../../impower-core/utils/setValue";

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

const doProjectValidate = (state: ProjectState): ProjectState => {
  const project = state.data;
  if (isGameProjectData(project)) {
    // Validate the entire project
    // This is slow, only call before starting game
    const blocks = Object.values(project.instances?.blocks?.data);
    const blockTriggers = blocks.flatMap((block) =>
      Object.values(block.triggers?.data)
    );
    const blockCommands = blocks.flatMap((block) =>
      Object.values(block.commands?.data)
    );
    let newProject = { ...project };
    const validateData = (
      project: GameProjectData,
      newData: InstanceData[]
    ): {
      updated: { [refId: string]: InstanceData };
      original: { [refId: string]: InstanceData };
    } => ImpowerGameInspector.instance.validateData(project, newData);
    // Validate all triggers and commands
    newProject = {
      ...newProject,
      ...insertGameProjectData(newProject, blockTriggers, validateData),
    };
    newProject = {
      ...newProject,
      ...insertGameProjectData(newProject, blockCommands, validateData),
    };
    if (JSON.stringify(newProject) !== JSON.stringify(state.data)) {
      return {
        ...state,
        data: {
          ...state.data,
          ...newProject,
        },
      };
    }
  }
  return state;
};

const doProjectValidateData = (
  state: ProjectState,
  payload: {
    newData: InstanceData[];
  }
): ProjectState => {
  if (isGameProjectData(state.data)) {
    const { newData } = payload;

    const firstData = newData[0];
    if (!firstData) {
      return state;
    }

    const validateData = (
      project: GameProjectData,
      newData: InstanceData[]
    ): {
      updated: { [refId: string]: InstanceData };
      original: { [refId: string]: InstanceData };
    } => ImpowerGameInspector.instance.validateData(project, newData);

    const { newProject } = insertGameProjectData(
      state.data,
      newData,
      validateData
    );

    if (JSON.stringify(newProject) !== JSON.stringify(state.data)) {
      // Inserting data automatically validates it
      // But by making this a separate action,
      // it can be ignored by the undo/redo tracking
      return {
        ...state,
        data: {
          ...state.data,
          ...newProject,
        },
      };
    }
  }
  return state;
};

const doProjectInsertData = (
  state: ProjectState,
  payload: {
    description?: string;
    newData: InstanceData[];
    index?: number;
    skipSync?: boolean;
  }
): ProjectState => {
  if (isGameProjectData(state.data)) {
    const { description, newData, index, skipSync } = payload;

    const firstData = newData[0];
    if (!firstData) {
      return state;
    }
    const validateData = (
      project: GameProjectData,
      newData: InstanceData[]
    ): {
      updated: { [refId: string]: InstanceData };
      original: { [refId: string]: InstanceData };
    } => ImpowerGameInspector.instance.validateData(project, newData);

    const { newProject } = insertGameProjectData(
      state.data,
      newData,
      validateData,
      index
    );

    const dataListSummary =
      ImpowerGameInspector.instance.getDataListSummary(newData);

    const lastActionDescription = description
      ? `${description} ${dataListSummary}`
      : undefined;

    let lastActionTargets = [];
    if (!skipSync) {
      lastActionTargets = ProjectEngineSync.instance.syncData(
        newProject,
        state.data,
        state.collection,
        state.id
      );
    }

    return {
      ...state,
      lastActionDescription:
        lastActionDescription || state.lastActionDescription,
      lastActionTargets,
      data: {
        ...state.data,
        ...newProject,
      },
    };
  }
  return state;
};

const doProjectRemoveData = (
  state: ProjectState,
  payload: {
    description?: string;
    references: Reference[];
    skipSync?: boolean;
  }
): ProjectState => {
  if (isGameProjectData(state.data)) {
    const { description, references, skipSync } = payload;

    const firstReference = references[0];
    if (!firstReference) {
      return state;
    }

    const firstData = getData(firstReference, state.data);
    if (!firstData) {
      return state;
    }

    const { newProject, deleted } = removeGameProjectData(
      state.data,
      references
    );

    const dataListSummary = ImpowerGameInspector.instance.getDataListSummary(
      Object.values(deleted)
    );

    const lastActionDescription = description
      ? `${description} ${dataListSummary}`
      : undefined;

    let lastActionTargets = [];
    if (!skipSync) {
      lastActionTargets = ProjectEngineSync.instance.syncData(
        newProject,
        state.data,
        state.collection,
        state.id
      );
    }

    return {
      ...state,
      lastActionDescription:
        lastActionDescription || state.lastActionDescription,
      lastActionTargets,
      data: {
        ...state.data,
        ...newProject,
      },
    };
  }
  return state;
};

const doProjectUpdateData = (
  state: ProjectState,
  payload: {
    description: string;
    references: Reference[];
    propertyPath: string;
    value: unknown;
  }
): ProjectState => {
  if (isGameProjectData(state.data)) {
    const { description, references, propertyPath, value } = payload;

    const project = state.data;
    const newData = references.map((r) => {
      const d = getData(r, project);
      if (!d) {
        throw new Error(`Invalid Reference: ${JSON.stringify(r)}`);
      }
      return setValue(d, propertyPath, value);
    }) as InstanceData[];

    return doProjectInsertData(state, { description, newData });
  }
  return state;
};

const doProjectChangeDocument = (
  state: ProjectState,
  payload: {
    collection: "games" | "resources";
    id: string;
    doc: GameDocument | ResourceDocument;
    skipSync: boolean;
  }
): ProjectState => {
  const { collection, id, doc, skipSync } = payload;

  if (!skipSync && id) {
    ProjectEngineSync.instance.syncDoc(doc, collection, id);
  }
  if (collection === "games") {
    return {
      ...state,
      collection,
      id,
      data: {
        ...(state.data || {}),
        doc,
      },
      lastActionDescription: "Updated Game Details",
      lastActionTargets: [`${collection}/${id}`],
    };
  }
  if (collection === "resources") {
    return {
      ...state,
      collection,
      id,
      data: {
        ...(state.data || {}),
        doc,
      },
      lastActionDescription: "Updated Resource Details",
      lastActionTargets: [`${collection}/${id}`],
    };
  }
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
        description: "Remove",
        references: Object.values(data).map((d) => d.reference),
        skipSync,
      }
    );
  }
  if (change === "added") {
    return doProjectInsertData(
      { ...state, id },
      {
        description: "Add",
        newData: Object.values(data).map((d) => d),
        skipSync,
      }
    );
  }
  if (change === "modified") {
    return doProjectInsertData(
      { ...state, id },
      {
        description: "Update",
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

const doProjectLoadData = (
  state: ProjectState,
  payload: {
    collection: "games" | "resources";
    id: string;
    data: ResourceProjectData | GameProjectData;
  }
): ProjectState => {
  const { collection, id, data } = payload;
  return {
    ...state,
    collection,
    id,
    data,
  };
};

export const projectReducer = (
  state = createProjectState(),
  action: ProjectAction
): ProjectState => {
  switch (action.type) {
    case PROJECT_ACCESS:
      return doProjectAccess(state, action.payload);
    case PROJECT_VALIDATE:
      return doProjectValidate(state);
    case PROJECT_VALIDATE_DATA:
      return doProjectValidateData(state, action.payload);
    case PROJECT_INSERT_DATA:
      return doProjectInsertData(state, action.payload);
    case PROJECT_REMOVE_DATA:
      return doProjectRemoveData(state, action.payload);
    case PROJECT_UPDATE_DATA:
      return doProjectUpdateData(state, action.payload);
    case PROJECT_CHANGE_DOCUMENT:
      return doProjectChangeDocument(state, action.payload);
    case PROJECT_LOAD_DATA:
      return doProjectLoadData(state, action.payload);
    case PROJECT_CHANGE_INSTANCE_DATA:
      return doProjectChangeInstanceData(state, action.payload);
    default:
      return state;
  }
};
