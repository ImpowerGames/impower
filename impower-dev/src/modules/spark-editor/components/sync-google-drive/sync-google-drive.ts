import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
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

  get contentEl() {
    return this.getElementById("content")!;
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
      if (accountInfo) {
        await this.loadAuthenticatedUI(accountInfo);
      } else {
        await this.loadUnauthenticatedUI();
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  handleRevoke = async () => {
    await this.loadUnauthenticatedUI();
  };

  handleSignIn = async () => {
    try {
      const provider = Workspace.sync.google;
      const accountInfo = await provider.signIn();
      if (accountInfo) {
        await this.loadAuthenticatedUI(accountInfo);
      } else {
        await this.loadUnauthenticatedUI();
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  handleSignOut = async () => {
    try {
      const provider = Workspace.sync.google;
      await provider.signOut();
      await this.loadUnauthenticatedUI();
    } catch (err: any) {
      console.error(err);
    }
  };

  handleImportProjectFile = async () => {
    try {
      const provider = Workspace.sync.google;
      const accessToken = await provider.getAccessToken();
      if (accessToken) {
        this.emit("picking");
        const file = await provider.importProjectFile(accessToken);
        console.log(file);
        if (file != null) {
          // TODO: Save file id, name, and chunks to WorkspaceFileSystem.currentProject
          // TODO: Save file !capabilities.canModifiyContent to WorkspaceFileSystem.currentProject.readonly
          await Workspace.fs.writeTextDocument({
            textDocument: {
              uri: Workspace.fs.getWorkspaceUri("logic/main.sd"),
            },
            text: file.data,
          });
        }
        this.emit("picked", file);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  handleSaveProjectFile = async () => {
    try {
      const provider = Workspace.sync.google;
      const accessToken = await provider.getAccessToken();
      if (accessToken) {
        // TODO: Bundle opfs chunks into one project file
        const buffer = await Workspace.fs.readFile({
          file: { uri: Workspace.fs.getWorkspaceUri("logic/main.sd") },
        });
        const blob = new File([buffer], "main.sd", { type: "text/plain" });
        const currentProject = {
          id: "18uhG5GUsHxgA-U92jkiN4c8H14zTsQdP",
          readonly: false,
        }; // TODO: Get from WorkspaceFileSystem.currentProject
        if (currentProject && currentProject.id && !currentProject.readonly) {
          this.emit("saving");
          const file = await provider.saveProjectFile(currentProject.id, blob);
          this.emit("saved", file);
        } else {
          this.emit("picking");
          const file = await provider.exportProjectFile(accessToken, blob);
          this.emit("picked", file);
        }
        // TODO: Save file id, name, and chunks to WorkspaceFileSystem.currentProject
        // TODO: Save file !capabilities.canModifiyContent to WorkspaceFileSystem.currentProject.readonly
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  async loadAuthenticatedUI(accountInfo: AccountInfo) {
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

  async loadUnauthenticatedUI() {
    this.contentEl.textContent = "";
    this.unauthenticatedEl.hidden = false;
    this.authenticatedEl.hidden = true;
  }
}
