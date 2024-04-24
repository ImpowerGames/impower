import { Component } from "../../../../../../packages/spec-component/src/component";
import { downloadFile } from "../../utils/downloadFile";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import { AccountInfo } from "../../workspace/types/AccountInfo";
import spec from "./_account";

export default class Account extends Component(spec) {
  override onConnected() {
    this.load();
    Workspace.sync.google.addEventListener("revoke", this.handleRevoke);
    this.ref.importProjectButton.addEventListener(
      "change",
      this.handleImportLocalProject
    );
    this.ref.exportProjectButton.addEventListener(
      "click",
      this.handleExportLocalProject
    );
    this.ref.loadProjectButton.addEventListener(
      "click",
      this.handleLoadRemoteProject
    );
    this.ref.saveProjectButton.addEventListener(
      "click",
      this.handleSaveRemoteProject
    );
    this.ref.signinButton.addEventListener("click", this.handleSignIn);
    this.ref.signoutButton.addEventListener("click", this.handleSignOut);
  }

  override onDisconnected() {
    Workspace.sync.google.removeEventListener("revoke", this.handleRevoke);
    this.ref.importProjectButton.removeEventListener(
      "change",
      this.handleImportLocalProject
    );
    this.ref.exportProjectButton.removeEventListener(
      "click",
      this.handleExportLocalProject
    );
    this.ref.loadProjectButton.removeEventListener(
      "click",
      this.handleLoadRemoteProject
    );
    this.ref.saveProjectButton.removeEventListener(
      "click",
      this.handleSaveRemoteProject
    );
    this.ref.signinButton.removeEventListener("click", this.handleSignIn);
    this.ref.signoutButton.removeEventListener("click", this.handleSignOut);
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
      console.log(process.env);
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

  handleImportLocalProject = async (e: Event) => {
    const event = e as Event & {
      target: HTMLInputElement & EventTarget;
    };
    const fileList = event.target.files;
    if (fileList) {
      const file = Array.from(fileList)[0];
      if (file) {
        const fileName = file.name;
        const fileBuffer = await file.arrayBuffer();
        await Workspace.window.importLocalProject(fileName, fileBuffer);
      }
    }
  };

  handleExportLocalProject = async () => {
    const zip = await Workspace.window.exportLocalProject();
    if (zip) {
      const name = Workspace.window.store.project.name;
      downloadFile(`${name}.zip`, "application/x-zip", zip);
    }
  };

  handleLoadRemoteProject = async () => {
    try {
      const syncProvider = Workspace.sync.google;
      const access = await syncProvider.getAccess();
      const token = access.token;
      if (token) {
        Workspace.window.startedPickingRemoteProjectResource();
        const fileId = await syncProvider.pickRemoteProjectFile(token);
        if (fileId) {
          Workspace.window.unloadProject();
          Workspace.window.loadNewProject(fileId);
        }
        Workspace.window.finishedPickingRemoteProjectResource();
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  handleSaveRemoteProject = async () => {
    try {
      const store = this.stores.workspace.current;
      const projectId = store?.project?.id;
      if (projectId) {
        const syncProvider = Workspace.sync.google;
        const access = await syncProvider.getAccess();
        const token = access.token;
        if (token) {
          Workspace.window.startedPickingRemoteProjectResource();
          const folderId = await syncProvider.pickRemoteProjectFolder(token);
          if (folderId) {
            await Workspace.window.saveRemoteProject(folderId);
          }
          Workspace.window.finishedPickingRemoteProjectResource();
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
    this.ref.unauthenticated.hidden = true;
    this.ref.authenticated.hidden = false;
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
