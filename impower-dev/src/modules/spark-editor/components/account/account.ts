import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import { AccountInfo } from "../../workspace/types/AccountInfo";
import spec from "./_account";

export default class Account extends Component(spec) {
  override onConnected() {
    this.load();
    Workspace.sync.google.addEventListener("revoke", this.handleRevoke);
    this.ref.signinButton.addEventListener("click", this.handleSignIn);
    this.ref.signoutButton.addEventListener("click", this.handleSignOut);
    this.ref.importProjectButton.addEventListener(
      "click",
      this.handleImportProjectFile
    );
    this.ref.exportProjectButton.addEventListener(
      "click",
      this.handleExportProjectFile
    );
  }

  override onDisconnected() {
    Workspace.sync.google.removeEventListener("revoke", this.handleRevoke);
    this.ref.signinButton.removeEventListener("click", this.handleSignIn);
    this.ref.signoutButton.removeEventListener("click", this.handleSignOut);
    this.ref.importProjectButton.removeEventListener(
      "click",
      this.handleImportProjectFile
    );
    this.ref.exportProjectButton.removeEventListener(
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
        Workspace.window.startedPickingProjectResource();
        const fileId = await syncProvider.pickProjectFile(token);
        if (fileId) {
          Workspace.window.unloadProject();
          Workspace.window.loadNewProject(fileId);
        }
        Workspace.window.finishedPickingProjectResource();
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  handleExportProjectFile = async () => {
    try {
      const store = this.stores.workspace.current;
      const projectId = store?.project?.id;
      if (projectId) {
        const syncProvider = Workspace.sync.google;
        const access = await syncProvider.getAccess();
        const token = access.token;
        if (token) {
          Workspace.window.startedPickingProjectResource();
          const folderId = await syncProvider.pickProjectFolder(token);
          if (folderId) {
            await Workspace.window.exportProject(folderId);
          }
          Workspace.window.finishedPickingProjectResource();
        }
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  loadAccountUI(accountInfo: AccountInfo | null) {
    if (!accountInfo || !accountInfo.uid) {
      this.loadUnauthenticatedUI();
    } else {
      if (accountInfo.consented) {
        this.loadAuthenticatedUI(accountInfo);
      } else {
        this.loadUnauthenticatedUI("Grant Access To Google Drive");
      }
    }
  }

  loadAuthenticatedUI(accountInfo: AccountInfo) {
    if (accountInfo.displayName) {
      this.ref.accountName.textContent = accountInfo.displayName;
      this.ref.accountName.hidden = false;
    } else {
      this.ref.accountName.hidden = true;
    }
    if (accountInfo.email) {
      this.ref.accountEmail.textContent = accountInfo.email;
      this.ref.accountEmail.hidden = false;
    } else {
      this.ref.accountEmail.hidden = true;
    }
    this.ref.authenticated.hidden = false;
    this.ref.unauthenticated.hidden = true;
    if (accountInfo.offline) {
      this.ref.importProjectButton.setAttribute("disabled", "");
      this.ref.exportProjectButton.setAttribute("disabled", "");
    } else {
      this.ref.importProjectButton.removeAttribute("disabled");
      this.ref.exportProjectButton.removeAttribute("disabled");
    }
  }

  loadUnauthenticatedUI(label: string = "Sync With Google Drive") {
    this.ref.signinButton.textContent = label;
    this.ref.unauthenticated.hidden = false;
    this.ref.authenticated.hidden = true;
  }
}
