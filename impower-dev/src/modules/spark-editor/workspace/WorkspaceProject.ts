const CURRENT_PROJECT_ID_LOOKUP = "project/id";
const CURRENT_PROJECT_SYNC_LOOKUP = "project/sync";

const LOCAL_PROJECT_ID = "local";

export default class WorkspaceProject {
  static LOCAL_ID = LOCAL_PROJECT_ID;

  protected _id: string;
  get id() {
    return this._id;
  }

  protected _sync: boolean;
  get sync() {
    return this._sync;
  }

  get isLocal() {
    return this._id === LOCAL_PROJECT_ID;
  }

  constructor() {
    const cachedId = localStorage.getItem(CURRENT_PROJECT_ID_LOOKUP);
    if (cachedId) {
      this._id = cachedId;
    } else {
      this._id = LOCAL_PROJECT_ID;
    }
    const cachedSync = localStorage.getItem(CURRENT_PROJECT_SYNC_LOOKUP);
    if (cachedSync) {
      this._sync = Boolean(JSON.parse(cachedSync));
    } else {
      this._sync = false;
    }
  }

  set(id: string, canSync: boolean) {
    this._id = id || LOCAL_PROJECT_ID;
    this._sync = canSync;
    localStorage.setItem(CURRENT_PROJECT_ID_LOOKUP, this._id);
    localStorage.setItem(
      CURRENT_PROJECT_SYNC_LOOKUP,
      JSON.stringify(this._sync)
    );
  }

  getPersistenceState() {
    if (this.sync) {
      return "Synced online";
    }
    return "Saved to cache";
  }
}
