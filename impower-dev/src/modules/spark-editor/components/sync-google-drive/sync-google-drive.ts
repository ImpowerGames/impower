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
      await provider.signOut();
      this.loadUnauthenticatedUI();
      Workspace.project.loadProject(WorkspaceProject.LOCAL_ID);
      await Workspace.window.loadProjectName(WorkspaceProject.LOCAL_ID);
    } catch (err: any) {
      console.error(err);
    }
  };

  handleImportProjectFile = async () => {
    try {
      const syncProvider = Workspace.sync.google;
      const access = await syncProvider.getAccess();
      if (access.token) {
        this.emit("picking");
        const file = await syncProvider.importProjectFile(access.token);
        // TODO: Save file !capabilities.canModifiyContent to WorkspaceSync.readonly
        if (file != null && file.id && file.name) {
          const projectId = file.id;
          const projectName = file.name.split(".")[0]!;
          const projectContent = file.data;
          // TODO: Block ui with loading spinner until all parts of project are loaded
          Workspace.project.loadProject(projectId);
          await Workspace.fs.writeProjectName(projectId, projectName);
          await Workspace.fs.writeProjectContent(projectId, projectContent);
          await Workspace.window.loadProjectName(projectId);
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
      if (access.token) {
        const projectId = Workspace.project.id;
        const name = await Workspace.fs.readProjectName(projectId);
        const text = await Workspace.fs.readProjectContent(projectId);
        const encoder = new TextEncoder();
        const encodedText = encoder.encode(text);
        const blob = new File([encodedText], `${name}.sd`, {
          type: "text/plain",
        });
        // TODO: Ensure project is not readonly by checking WorkspaceSync.readonly
        if (!Workspace.project.isLocal) {
          this.emit("saving");
          const file = await syncProvider.saveProjectFile(projectId, blob);
          this.emit("saved", file);
        } else {
          this.emit("picking");
          const file = await syncProvider.exportProjectFile(access.token, blob);
          this.emit("picked", file);
        }
      }
    } catch (err: any) {
      console.error(err);
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
