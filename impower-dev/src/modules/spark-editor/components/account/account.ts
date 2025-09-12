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
    this.refs.importProjectButton.addEventListener(
      "change",
      this.handleImportLocalProject
    );
    this.refs.exportProjectButton.addEventListener(
      "click",
      this.handleExportLocalProject
    );
    this.refs.loadProjectButton.addEventListener(
      "click",
      this.handleLoadRemoteProject
    );
    this.refs.saveProjectButton.addEventListener(
      "click",
      this.handleSaveRemoteProject
    );
    this.refs.signinButton.addEventListener("click", this.handleSignIn);
    this.refs.signoutButton.addEventListener("click", this.handleSignOut);
  }

  override onDisconnected() {
    Workspace.sync.google.removeEventListener("revoke", this.handleRevoke);
    this.refs.importProjectButton.removeEventListener(
      "change",
      this.handleImportLocalProject
    );
    this.refs.exportProjectButton.removeEventListener(
      "click",
      this.handleExportLocalProject
    );
    this.refs.loadProjectButton.removeEventListener(
      "click",
      this.handleLoadRemoteProject
    );
    this.refs.saveProjectButton.removeEventListener(
      "click",
      this.handleSaveRemoteProject
    );
    this.refs.signinButton.removeEventListener("click", this.handleSignIn);
    this.refs.signoutButton.removeEventListener("click", this.handleSignOut);
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
      this.refs.accountName.textContent = accountInfo.displayName;
      this.refs.accountName.hidden = false;
    } else {
      this.refs.accountName.hidden = true;
    }
    if (accountInfo.email) {
      this.refs.accountEmail.textContent = accountInfo.email;
      this.refs.accountEmail.hidden = false;
    } else {
      this.refs.accountEmail.hidden = true;
    }
    this.refs.unauthenticated.hidden = true;
    this.refs.authenticated.hidden = false;
    if (accountInfo.offline) {
      this.refs.importProjectButton.setAttribute("disabled", "");
      this.refs.exportProjectButton.setAttribute("disabled", "");
    } else {
      this.refs.importProjectButton.removeAttribute("disabled");
      this.refs.exportProjectButton.removeAttribute("disabled");
    }
  }

  loadUnauthenticatedUI(label: string = "Sync With Google Drive") {
    this.refs.signinButton.textContent = label;
    this.refs.unauthenticated.hidden = false;
    this.refs.authenticated.hidden = true;
  }
}
