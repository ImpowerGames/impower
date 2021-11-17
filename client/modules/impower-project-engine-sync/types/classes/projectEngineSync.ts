import { ProjectDocumentPath } from "../../../impower-api";
import { Event, RecursivePartial } from "../../../impower-core";
import { getUpdatedFields } from "../../../impower-data-state";
import { ProjectDocument } from "../../../impower-data-store";
import {
  GameProjectData,
  ProjectData,
  ResourceProjectData,
} from "../../../impower-game/data";

export class ProjectEngineSync {
  private static _instance: ProjectEngineSync;

  public static get instance(): ProjectEngineSync {
    if (!this._instance) {
      this._instance = new ProjectEngineSync();
    }
    return this._instance;
  }

  private _onLoad: Event = new Event();

  public get onLoad(): Event {
    return this._onLoad;
  }

  private _onLoaded: Event = new Event();

  public get onLoaded(): Event {
    return this._onLoaded;
  }

  private _onChange: Event = new Event();

  public get onChange(): Event {
    return this._onChange;
  }

  private _onSync: Event = new Event();

  public get onSync(): Event {
    return this._onSync;
  }

  async loadData<T extends GameProjectData | ResourceProjectData>(
    ...path: ProjectDocumentPath
  ): Promise<T> {
    this.onLoad.emit();
    const DataStateRead = (
      await import("../../../impower-data-state/classes/dataStateRead")
    ).default;
    const docSnap = await new DataStateRead(...path, "doc").get();
    const membersSnap = await new DataStateRead(...path, "members").get();
    const filesSnap = await new DataStateRead(
      ...path,
      "instances",
      "files"
    ).get();
    const foldersSnap = await new DataStateRead(
      ...path,
      "instances",
      "folders"
    ).get();
    const projectData: ProjectData = {
      doc: docSnap.val(),
      members: membersSnap.val(),
      instances: {
        files: filesSnap.val(),
        folders: foldersSnap.val(),
      },
    };
    const gameData: GameProjectData = undefined;
    const projectCollection = path[0];
    const projectId = path[1];
    if (projectCollection === "projects") {
      const configsSnap = await new DataStateRead(
        projectCollection,
        projectId,
        "instances",
        "configs"
      ).get();
      const constructsSnap = await new DataStateRead(
        projectCollection,
        projectId,
        "instances",
        "constructs"
      ).get();
      const blocksSnap = await new DataStateRead(
        projectCollection,
        projectId,
        "instances",
        "blocks"
      ).get();
      gameData.instances.configs = configsSnap.val();
      gameData.instances.constructs = constructsSnap.val();
      gameData.instances.blocks = blocksSnap.val();
    }
    this.onLoaded.emit();
    return { ...projectData, ...(gameData || {}) } as T;
  }

  async updateData<T extends GameProjectData | ResourceProjectData>(
    value: RecursivePartial<T>,
    ...path: ProjectDocumentPath
  ): Promise<void> {
    this.onChange.emit();
    const DataStateWrite = (
      await import("../../../impower-data-state/classes/dataStateWrite")
    ).default;
    await new DataStateWrite(...path).update(value);
    this.onSync.emit();
  }

  syncData<T extends GameProjectData | ResourceProjectData>(
    newProject: T,
    oldProject: T,
    ...path: ProjectDocumentPath
  ): string[] {
    const updatedFields = getUpdatedFields<T>(newProject, oldProject, "/");
    this.updateData(updatedFields, ...path);
    return Object.keys(updatedFields);
  }

  async updateDoc(
    doc: ProjectDocument,
    ...path: ProjectDocumentPath
  ): Promise<void> {
    this.onChange.emit();
    const DataStoreWrite = (
      await import("../../../impower-data-store/classes/dataStoreWrite")
    ).default;
    await new DataStoreWrite(...path).update(doc);
    this.onSync.emit();
  }

  syncDoc(update: ProjectDocument, ...path: ProjectDocumentPath): void {
    this.updateDoc(update, ...path);
  }
}
