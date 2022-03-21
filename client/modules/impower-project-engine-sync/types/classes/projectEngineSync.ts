import { ProjectDocumentPath } from "../../../impower-api";
import { Event, RecursivePartial } from "../../../impower-core";
import {
  getUpdatedFields,
  ProjectInstanceWritePath,
  ProjectScriptWritePath,
} from "../../../impower-data-state";
import { ProjectDocument } from "../../../impower-data-store";
import {
  FilesCollection,
  GameInstancesCollection,
  GameProjectData,
  GameScriptsCollection,
  InstanceData,
  MembersCollection,
  ProjectData,
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

  async loadData<T extends GameProjectData>(
    ...path: ProjectDocumentPath
  ): Promise<T> {
    this.onLoad.emit();
    const DataStateRead = (
      await import("../../../impower-data-state/classes/dataStateRead")
    ).default;
    const docSnap = await new DataStateRead(...path, "doc").get();
    const membersSnap = await new DataStateRead(...path, "members").get();
    const filesSnap = await new DataStateRead(...path, "files").get();
    const scriptsSnap = await new DataStateRead(...path, "scripts").get();
    const instancesSnap = await new DataStateRead(...path, "instances").get();
    const projectData: ProjectData = {
      doc: docSnap.val(),
      members: membersSnap.val(),
      files: filesSnap.val(),
      scripts: scriptsSnap.val(),
      instances: instancesSnap.val(),
    };
    this.onLoaded.emit();
    return { ...projectData } as T;
  }

  async observeDoc(
    onSnapshot: (value: ProjectDocument) => void,
    ...path: ProjectDocumentPath
  ): Promise<() => void> {
    this.onLoad.emit();
    const DataStateRead = (
      await import("../../../impower-data-state/classes/dataStateRead")
    ).default;
    const unsubscribe = await new DataStateRead(...path, "doc").observe((s) => {
      onSnapshot(s.val());
      this.onLoaded.emit();
    });
    return unsubscribe;
  }

  async observeMembers(
    onSnapshot: (value: MembersCollection) => void,
    ...path: ProjectDocumentPath
  ): Promise<() => void> {
    this.onLoad.emit();
    const DataStateRead = (
      await import("../../../impower-data-state/classes/dataStateRead")
    ).default;
    const unsubscribe = await new DataStateRead(...path, "members").observe(
      (s) => {
        onSnapshot(s.val());
        this.onLoaded.emit();
      }
    );
    return unsubscribe;
  }

  async observeFiles(
    onSnapshot: (value: FilesCollection) => void,
    ...path: ProjectDocumentPath
  ): Promise<() => void> {
    this.onLoad.emit();
    const DataStateRead = (
      await import("../../../impower-data-state/classes/dataStateRead")
    ).default;
    const unsubscribe = await new DataStateRead(...path, "files").observe(
      (s) => {
        onSnapshot?.(s.val());
        this.onLoaded.emit();
      }
    );
    return unsubscribe;
  }

  async observeScripts(
    onSnapshot: (value: GameScriptsCollection) => void,
    ...path: ProjectDocumentPath
  ): Promise<() => void> {
    this.onLoad.emit();
    const DataStateRead = (
      await import("../../../impower-data-state/classes/dataStateRead")
    ).default;
    const unsubscribe = await new DataStateRead(...path, "scripts").observe(
      (s) => {
        onSnapshot(s.val());
        this.onLoaded.emit();
      }
    );
    return unsubscribe;
  }

  async observeInstances(
    onSnapshot: (value: GameInstancesCollection) => void,
    ...path: ProjectDocumentPath
  ): Promise<() => void> {
    this.onLoad.emit();
    const DataStateRead = (
      await import("../../../impower-data-state/classes/dataStateRead")
    ).default;
    const unsubscribe = await new DataStateRead(...path, "instances").observe(
      (s) => {
        onSnapshot(s.val());
        this.onLoaded.emit();
      }
    );
    return unsubscribe;
  }

  async updateInstance<T extends InstanceData>(
    value: T,
    ...path: ProjectInstanceWritePath
  ): Promise<void> {
    this.onChange.emit();
    const DataStateWrite = (
      await import("../../../impower-data-state/classes/dataStateWrite")
    ).default;
    await new DataStateWrite(...path).update(value);
    this.onSync.emit();
  }

  async updateData<T extends GameProjectData>(
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

  syncData<T extends GameProjectData>(
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

  async updateScript(
    update: string,
    ...path: ProjectScriptWritePath
  ): Promise<void> {
    this.onChange.emit();
    const DataStateWrite = (
      await import("../../../impower-data-state/classes/dataStateWrite")
    ).default;
    await new DataStateWrite(...path).set(update);
    this.onSync.emit();
  }

  syncScript(update: string, ...path: ProjectScriptWritePath): void {
    this.updateScript(update, ...path);
  }
}
