import GoogleDriveSyncProvider from "./providers/GoogleDriveSyncProvider";

export default class WorkspaceSync {
  protected _google?: GoogleDriveSyncProvider;
  get google() {
    if (!this._google) {
      this._google = new GoogleDriveSyncProvider();
    }
    return this._google;
  }
}
