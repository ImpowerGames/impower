const CURRENT_PROJECT_LOOKUP = "project/current";

const LOCAL_PROJECT_ID = "local";

export default class WorkspaceProject {
  static LOCAL_ID = LOCAL_PROJECT_ID;

  protected _id: string;
  get id() {
    return this._id;
  }

  get isLocal() {
    return this._id === LOCAL_PROJECT_ID;
  }

  constructor() {
    const cachedId = localStorage.getItem(CURRENT_PROJECT_LOOKUP);
    if (cachedId) {
      this._id = cachedId;
    } else {
      this._id = LOCAL_PROJECT_ID;
    }
  }

  loadProject(id: string) {
    this._id = id || LOCAL_PROJECT_ID;
    localStorage.setItem(CURRENT_PROJECT_LOOKUP, this._id);
  }
}
