import loadScript from "../../utils/loadScript";
import SingletonPromise from "../SingletonPromise";
import { AccessInfo } from "../types/AccessInfo";
import { AccountInfo } from "../types/AccountInfo";
import { Storage } from "../types/StorageTypes";
import sendServerRequest from "../utils/sendServerRequest";

// setQuery is missing from DocsView definition. Must be declared manually
// https://developers.google.com/drive/picker/reference#view
type DocsView = google.picker.DocsView & {
  setQuery(query: string): google.picker.DocsView;
};

const BROWSER_GOOGLE_PROJECT_ID = process.env["BROWSER_GOOGLE_PROJECT_ID"]!;
const BROWSER_GOOGLE_API_KEY = process.env["BROWSER_GOOGLE_API_KEY"]!;
const BROWSER_GOOGLE_OAUTH_CLIENT_ID =
  process.env["BROWSER_GOOGLE_OAUTH_CLIENT_ID"]!;

// Authorization scopes required to sync files to a google drive folder
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.resource",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];
// ux_mode "popup" allows user to authenticate without being redirected away from the current page
const UX_MODE = "popup";
// redirect_uri must be "postmessage" for ux_mode "popup"
// https://stackoverflow.com/questions/55222501/google-oauth-redirect-uri-mismatch-when-exchanging-one-time-code-for-refresh-tok
const REDIRECT_URI = "postmessage";

// Google Identity Services Client Library
// https://developers.google.com/identity/gsi/web/guides/client-library
const GSI_SRC = "https://accounts.google.com/gsi/client";

// Google API Client Library
const GAPI_SRC = "https://apis.google.com/js/api.js";

export default class GoogleDriveSyncProvider {
  protected _gsiScriptRef = new SingletonPromise(this.loadGSIScript.bind(this));

  protected _gapiScriptRef = new SingletonPromise(
    this.loadGAPIScript.bind(this)
  );

  protected _pickerScriptRef = new SingletonPromise(
    this.loadPickerScript.bind(this)
  );

  protected _importPickerBuilderRef = new SingletonPromise(
    this.loadImportPicker.bind(this)
  );

  protected _exportPickerBuilderRef = new SingletonPromise(
    this.loadExportPicker.bind(this)
  );

  protected _accountRef = new SingletonPromise(this.fetchAccount.bind(this));

  protected _events = {
    revoke: new Set<Function>(),
  };

  protected async request<T>(
    method: "GET" | "POST" | "PUT",
    route: string,
    body?: XMLHttpRequestBodyInit,
    contentType?:
      | "application/x-www-form-urlencoded"
      | "application/json"
      | "text/plain"
  ) {
    try {
      const result = await sendServerRequest<T>(
        method,
        `${window.location.protocol}//${window.location.host}${route}`,
        body,
        contentType
      );
      return result;
    } catch (err: any) {
      if (err.error === "invalid_grant") {
        console.warn("access was revoked");
        this._events.revoke.forEach((l) => {
          l?.();
        });
      }
      throw err;
    }
  }

  addEventListener(event: keyof typeof this._events, listener: Function) {
    this._events[event].add(listener);
  }

  removeEventListener(event: keyof typeof this._events, listener: Function) {
    this._events[event].delete(listener);
  }

  protected async loadGSIScript() {
    await loadScript(GSI_SRC);
    return null;
  }

  protected async loadGAPIScript() {
    await loadScript(GAPI_SRC);
    return null;
  }

  protected async loadPickerScript() {
    await this._gapiScriptRef.get();
    await new Promise<void>((resolve, reject) => {
      gapi.load("client:picker", async () => {
        try {
          await gapi.client.load(
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
    return null;
  }

  protected async loadImportPicker() {
    await this._pickerScriptRef.get();
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMode(google.picker.DocsViewMode.LIST)
      .setMimeTypes("text/plain") as DocsView;
    view.setQuery("*.sd");
    return new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setDeveloperKey(BROWSER_GOOGLE_API_KEY)
      .setAppId(BROWSER_GOOGLE_PROJECT_ID)
      .setTitle("Select a project file")
      .addView(view);
  }

  async importProjectFile(accessToken: string) {
    const pickerBuilder = await this._importPickerBuilderRef.get();
    const importPicker = pickerBuilder.setOAuthToken(accessToken).build();
    const result = await new Promise<(Storage.File & { data: string }) | null>(
      (resolve, reject) => {
        importPicker.setCallback(async (data) => {
          try {
            if (data.action === google.picker.Action.CANCEL) {
              resolve(null);
            } else if (data.action === google.picker.Action.PICKED) {
              const document = data[google.picker.Response.DOCUMENTS][0];
              const id = document?.[google.picker.Document.ID];
              if (id) {
                const data = await this.getFile(id);
                resolve(data);
              } else {
                resolve(null);
              }
            }
          } catch (err) {
            reject(err);
          }
        });
        importPicker.setVisible(true);
      }
    );
    return result;
  }

  protected async loadExportPicker() {
    await this._pickerScriptRef.get();
    const foldersView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setParent("root")
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");
    const sharedWithMeView = new google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setOwnedByMe(false)
      .setMimeTypes("application/vnd.google-apps.folder");
    const sharedDrivesView = new google.picker.DocsView()
      .setIncludeFolders(true)
      .setEnableDrives(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");
    return new google.picker.PickerBuilder()
      .setSelectableMimeTypes("application/vnd.google-apps.folder")
      .setDeveloperKey(BROWSER_GOOGLE_API_KEY)
      .setAppId(BROWSER_GOOGLE_PROJECT_ID)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .addView(foldersView)
      .addView(sharedWithMeView)
      .addView(sharedDrivesView)
      .setTitle("Save to folder");
  }

  async exportProjectFile(accessToken: string, blob: Blob) {
    const pickerBuilder = await this._exportPickerBuilderRef.get();
    const exportPicker = pickerBuilder.setOAuthToken(accessToken).build();
    const result = await new Promise<Storage.File | null>((resolve, reject) => {
      exportPicker.setCallback(async (data) => {
        try {
          if (data.action === google.picker.Action.PICKED) {
            const document = data[google.picker.Response.DOCUMENTS][0];
            if (document) {
              const folderId = document[google.picker.Document.ID];
              const data = await this.createFile(folderId, blob);
              resolve(data);
            }
          }
          resolve(null);
        } catch (err) {
          reject(err);
        }
      });
      exportPicker.setVisible(true);
    });
    return result;
  }

  async saveProjectFile(fileId: string, blob: Blob) {
    return this.updateFile(fileId, blob);
  }

  protected async fetchAccount() {
    try {
      const account = await this.request<AccountInfo>(
        "GET",
        `/api/auth/account`
      );
      return account;
    } catch (err: any) {
      if (err.error === "unauthenticated" || err.error === "invalid_grant") {
        return null;
      } else {
        throw err;
      }
    }
  }

  async getCurrentAccount() {
    return this._accountRef.get();
  }

  async signIn() {
    await this.requestPermission();
    this._accountRef.reset();
    return this._accountRef.get();
  }

  async signOut() {
    this._accountRef.reset();
    await this.request("POST", `/api/auth/signout`);
  }

  protected async requestPermission() {
    await this._gsiScriptRef.get();
    const account = await this._accountRef.get();
    return new Promise<AccessInfo>((resolve, reject) => {
      const authClient = google.accounts.oauth2.initCodeClient({
        client_id: BROWSER_GOOGLE_OAUTH_CLIENT_ID,
        scope: SCOPES.join(" "),
        ux_mode: UX_MODE,
        redirect_uri: REDIRECT_URI,
        login_hint: account?.email,
        callback: async (response) => {
          if (response.error) {
            reject(response.error);
          } else {
            try {
              const access = await this.request<AccessInfo>(
                "POST",
                `/api/auth/signin`,
                `code=${response.code}`,
                "application/x-www-form-urlencoded"
              );
              resolve(access);
            } catch (err) {
              reject();
            }
          }
        },
        error_callback: (err) => {
          reject(err);
        },
      });
      // Prompt the user to select a Google Account and ask for consent to access their data
      authClient.requestCode();
    });
  }

  async getAccessToken() {
    let access: AccessInfo = await this.request<AccessInfo>(
      "GET",
      `/api/auth/access`
    );
    if (!this.hasDriveAccess(access.scope)) {
      access = await this.requestPermission();
      if (!this.hasDriveAccess(access.scope)) {
        return null;
      }
    }
    return access.token;
  }

  protected async getFile(fileId: string) {
    const result = await this.request<Storage.File & { data: string }>(
      "GET",
      `/api/storage/file/${fileId}`
    );
    return result;
  }

  protected async createFile(folderId: string, blob: Blob) {
    const formData = new FormData();
    formData.append("file", blob);
    return this.request<Storage.File>(
      "POST",
      `/api/storage/file/${folderId}`,
      formData
    );
  }

  protected async updateFile(fileId: string, blob: Blob) {
    const formData = new FormData();
    formData.append("file", blob);
    return this.request<Storage.File>(
      "PUT",
      `/api/storage/file/${fileId}`,
      formData
    );
  }

  protected hasDriveAccess(scope: string) {
    const grantedScopes = scope.split(" ");
    return grantedScopes.includes("https://www.googleapis.com/auth/drive.file");
  }
}
