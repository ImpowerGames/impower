import { DidWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFileMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import WorkspaceProject from "../../workspace/WorkspaceProject";
import { AccountInfo } from "../../workspace/types/AccountInfo";
import component from "./_sync-google-drive";

export default class SyncGoogleDrive extends SEElement {
  static override async define(
    tag = "se-sync-google-drive",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  get authenticatedEl() {
    return this.getElementById("authenticated")!;
  }

  get unauthenticatedEl() {
    return this.getElementById("unauthenticated")!;
  }

  get loadedProjectEl() {
    return this.getElementById("loaded-project")!;
  }

  get accountAvatarEl() {
    return this.getElementById<HTMLImageElement>("account-avatar")!;
  }

  get accountNameEl() {
    return this.getElementById("account-name")!;
  }

  get accountEmailEl() {
    return this.getElementById("account-email")!;
  }

  get signinButtonEl() {
    return this.getElementById("signin-button")!;
  }

  get signoutButtonEl() {
    return this.getElementById("signout-button")!;
  }

  get uploadButtonEl() {
    return this.getElementById("upload-button")!;
  }

  get loadProjectButtonEl() {
    return this.getElementById("load-project-button")!;
  }

  get saveProjectButtonEl() {
    return this.getElementById("save-project-button")!;
  }

  protected override onConnected(): void {
    this.load();
    Workspace.sync.google.addEventListener("revoke", this.handleRevoke);
    this.signinButtonEl.addEventListener("click", this.handleSignIn);
    this.signoutButtonEl.addEventListener("click", this.handleSignOut);
    this.loadProjectButtonEl.addEventListener(
      "click",
      this.handleImportProjectFile
    );
    this.saveProjectButtonEl.addEventListener(
      "click",
      this.handleSaveProjectFile
    );
    window.addEventListener(
      DidWriteFileMessage.method,
      this.handleDidWriteFile
    );
  }

  protected override onDisconnected(): void {
    Workspace.sync.google.removeEventListener("revoke", this.handleRevoke);
    this.signinButtonEl.removeEventListener("click", this.handleSignIn);
    this.signoutButtonEl.removeEventListener("click", this.handleSignOut);
    this.loadProjectButtonEl.removeEventListener(
      "click",
      this.handleImportProjectFile
    );
    this.saveProjectButtonEl.removeEventListener(
      "click",
      this.handleSaveProjectFile
    );
    window.removeEventListener(
      DidWriteFileMessage.method,
      this.handleDidWriteFile
    );
  }

  async load() {
    try {
      const provider = Workspace.sync.google;
      const accountInfo = await provider.getCurrentAccount();
      this.loadAccountUI(accountInfo);
    } catch (err: any) {
      console.error(err);
    }
  }

  handleRevoke = async () => {
    this.loadUnauthenticatedUI();
  };

  handleSignIn = async () => {
    try {
      const provider = Workspace.sync.google;
      const accountInfo = await provider.signIn();
      this.loadAccountUI(accountInfo);
    } catch (err: any) {
      console.error(err);
      this.loadUnauthenticatedUI();
    }
  };

  handleSignOut = async () => {
    try {
      const provider = Workspace.sync.google;
      Workspace.window.changePersistenceState("Loading...");
      await provider.signOut();
      this.loadUnauthenticatedUI();
      Workspace.project.set(WorkspaceProject.LOCAL_ID, false);
      await Workspace.window.loadProjectName(WorkspaceProject.LOCAL_ID);
      Workspace.window.changePersistenceState("Saved to cache");
    } catch (err: any) {
      console.error(err);
    }
  };

  handleImportProjectFile = async () => {
    try {
      const syncProvider = Workspace.sync.google;
      const access = await syncProvider.getAccess();
      const token = access.token;
      if (token) {
        this.emit("picking");
        const file = await syncProvider.importProjectFile(token);
        if (file != null && file.id && file.name) {
          const projectId = file.id;
          const projectName = file.name.split(".")[0]!;
          const projectContent = file.data;
          const canSync = Boolean(file.capabilities?.canModifyContent);
          // TODO: Block ui with loading spinner until all parts of project are loaded
          Workspace.window.changePersistenceState("Loading...");
          Workspace.project.set(projectId, canSync);
          await Workspace.fs.writeProjectName(projectId, projectName);
          await Workspace.fs.writeProjectContent(projectId, projectContent);
          await Workspace.window.loadProjectName(projectId);
          Workspace.window.changePersistenceState("Synced online");
        }
        this.emit("picked", file);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  handleSaveProjectFile = async () => {
    try {
      const syncProvider = Workspace.sync.google;
      const access = await syncProvider.getAccess();
      const token = access.token;
      if (token) {
        const projectId = Workspace.project.id;
        Workspace.window.changePersistenceState("Syncing...");
        const name = await Workspace.fs.readProjectName(projectId);
        const text = await Workspace.fs.readProjectContent(projectId);
        if (!Workspace.project.sync) {
          this.emit("saving");
          const file = await syncProvider.saveProjectFile(projectId, text);
          this.emit("saved", file);
        } else {
          this.emit("picking");
          const filename = `${name}.sd`;
          const file = await syncProvider.exportProjectFile(
            token,
            filename,
            text
          );
          this.emit("picked", file);
        }
        Workspace.window.changePersistenceState("Synced online");
      }
    } catch (err: any) {
      console.error(err);
      Workspace.window.changePersistenceState("Error: Unable to sync");
    }
  };

  handleDidWriteFile = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidWriteFileMessage.type.isNotification(message)) {
        const params = message.params;
        const file = params.file;
        if (!Workspace.project.isLocal) {
          const syncProvider = Workspace.sync.google;
          if (file?.text != null) {
            // TODO: Bundle all scripts before syncing
            if (file.name === "main" && file.ext === "script") {
              Workspace.window.changePersistenceState("Syncing...");
              this.emit("saving");
              const projectId = Workspace.project.id;
              const projectFile = await syncProvider.saveProjectFile(
                projectId,
                file.text
              );
              this.emit("saved", projectFile);
              Workspace.window.changePersistenceState("Synced online");
            }
          }
        }
      }
    }
  };

  loadAccountUI(accountInfo: AccountInfo | null) {
    if (accountInfo) {
      if (accountInfo.consented) {
        this.loadAuthenticatedUI(accountInfo);
      } else {
        this.loadUnauthenticatedUI("Grant Access To Google Drive");
      }
    } else {
      this.loadUnauthenticatedUI();
    }
  }

  loadAuthenticatedUI(accountInfo: AccountInfo) {
    if (accountInfo.photoURL) {
      this.accountAvatarEl.src = accountInfo.photoURL;
      this.accountAvatarEl.hidden = false;
    } else {
      this.accountAvatarEl.hidden = true;
    }
    if (accountInfo.displayName) {
      this.accountNameEl.textContent = accountInfo.displayName;
      this.accountNameEl.hidden = false;
    } else {
      this.accountNameEl.hidden = true;
    }
    if (accountInfo.email) {
      this.accountEmailEl.textContent = accountInfo.email;
      this.accountEmailEl.hidden = false;
    } else {
      this.accountEmailEl.hidden = true;
    }
    this.authenticatedEl.hidden = false;
    this.unauthenticatedEl.hidden = true;
  }

  loadUnauthenticatedUI(label: string = "Sync With Google Drive") {
    this.signinButtonEl.textContent = label;
    this.unauthenticatedEl.hidden = false;
    this.authenticatedEl.hidden = true;
  }
}
