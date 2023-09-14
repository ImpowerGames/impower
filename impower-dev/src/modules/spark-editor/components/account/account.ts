import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import { AccountInfo } from "../../workspace/types/AccountInfo";
import spec from "./_account";

export default class Account extends Component(spec) {
  get authenticatedEl() {
    return this.getElementById("authenticated")!;
  }

  get unauthenticatedEl() {
    return this.getElementById("unauthenticated")!;
  }

  get loadedProjectEl() {
    return this.getElementById("loaded-project")!;
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

  get importProjectButtonEl() {
    return this.getElementById("import-project-button")!;
  }

  get exportProjectButtonEl() {
    return this.getElementById("export-project-button")!;
  }

  override onConnected(): void {
    this.load();
    Workspace.sync.google.addEventListener("revoke", this.handleRevoke);
    this.signinButtonEl.addEventListener("click", this.handleSignIn);
    this.signoutButtonEl.addEventListener("click", this.handleSignOut);
    this.importProjectButtonEl.addEventListener(
      "click",
      this.handleImportProjectFile
    );
    this.exportProjectButtonEl.addEventListener(
      "click",
      this.handleExportProjectFile
    );
  }

  override onDisconnected(): void {
    Workspace.sync.google.removeEventListener("revoke", this.handleRevoke);
    this.signinButtonEl.removeEventListener("click", this.handleSignIn);
    this.signoutButtonEl.removeEventListener("click", this.handleSignOut);
    this.importProjectButtonEl.removeEventListener(
      "click",
      this.handleImportProjectFile
    );
    this.exportProjectButtonEl.removeEventListener(
      "click",
      this.handleExportProjectFile
    );
  }

  async load() {
    try {
      const syncProvider = Workspace.sync.google;
      const accountInfo = await syncProvider.getCurrentAccount();
      this.loadAccountUI(accountInfo);
      await Workspace.window.loadProject();
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
      Workspace.window.unloadProject();
      await provider.signOut();
      const projectId = WorkspaceConstants.LOCAL_PROJECT_ID;
      Workspace.window.loadNewProject(projectId);
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
        const fileId = await syncProvider.pickProjectFile(token);
        if (fileId) {
          Workspace.window.unloadProject();
          Workspace.window.loadNewProject(fileId);
        }
        this.emit("picked", fileId);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  handleExportProjectFile = async () => {
    try {
      const store = this.context.get();
      const projectId = store?.project?.id;
      if (projectId) {
        const syncProvider = Workspace.sync.google;
        const access = await syncProvider.getAccess();
        const token = access.token;
        if (token) {
          this.emit("picking");
          const folderId = await syncProvider.pickProjectFolder(token);
          if (folderId) {
            await Workspace.window.exportProject(folderId);
          }
          this.emit("picked", folderId);
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
