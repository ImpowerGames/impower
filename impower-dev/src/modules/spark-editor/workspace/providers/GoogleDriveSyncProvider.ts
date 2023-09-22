import loadScript from "../../utils/loadScript";
import SingletonPromise from "../SingletonPromise";
import { AccessInfo } from "../types/AccessInfo";
import { AccountInfo } from "../types/AccountInfo";
import { RemoteStorage } from "../types/RemoteStorageTypes";
import { ResponseTypeMap } from "../types/ResponseTypeMap";
import sendServerRequest from "../utils/sendServerRequest";

// setQuery is missing from DocsView definition. Must be declared manually
// https://developers.google.com/drive/picker/reference#view
type DocsView = google.picker.DocsView & {
  setQuery(query: string): google.picker.DocsView;
};

const BROWSER_GOOGLE_API_KEY = process.env["BROWSER_GOOGLE_API_KEY"]!;
const BROWSER_GOOGLE_OAUTH_CLIENT_ID =
  process.env["BROWSER_GOOGLE_OAUTH_CLIENT_ID"]!;

// App Id must match first part of OAuth Client Id
// https://stackoverflow.com/a/17204637
// https://stackoverflow.com/a/26285995
const BROWSER_GOOGLE_APP_ID = BROWSER_GOOGLE_OAUTH_CLIENT_ID.split("-")[0]!;

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

// Discovery doc URL for APIs
const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

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
    responseType: XMLHttpRequestResponseType,
    body?: XMLHttpRequestBodyInit,
    contentType?:
      | "application/x-www-form-urlencoded"
      | "application/json"
      | "text/plain"
  ) {
    try {
      const result = (await sendServerRequest(
        method,
        `${window.location.protocol}//${window.location.host}${route}`,
        responseType,
        body,
        contentType
      )) as T;
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
    return loadScript(GSI_SRC);
  }

  protected async loadGAPIScript() {
    const result = await loadScript(GAPI_SRC);
    await new Promise<void>((resolve) => {
      gapi.load("client", async () => {
        await gapi.client.init({
          apiKey: BROWSER_GOOGLE_API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        });
        resolve();
      });
    });
    return result;
  }

  protected async loadPickerScript() {
    await this._gapiScriptRef.get();
    await new Promise<void>((resolve, reject) => {
      gapi.load("client:picker", async () => {
        try {
          await gapi.client.load(DISCOVERY_DOC);
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
      .setMimeTypes("text/plain,application/zip") as DocsView;
    view.setQuery(`title:.${this.getProjectExtension()}`);
    return new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setDeveloperKey(BROWSER_GOOGLE_API_KEY)
      .setAppId(BROWSER_GOOGLE_APP_ID)
      .setTitle("Select a project file")
      .addView(view);
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
      .setAppId(BROWSER_GOOGLE_APP_ID)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .addView(foldersView)
      .addView(sharedWithMeView)
      .addView(sharedDrivesView)
      .setTitle("Save to folder");
  }

  async pickProjectFile(accessToken: string) {
    const pickerBuilder = await this._importPickerBuilderRef.get();
    const importPicker = pickerBuilder.setOAuthToken(accessToken).build();
    const result = await new Promise<string | null>((resolve, reject) => {
      importPicker.setCallback(async (data) => {
        try {
          if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          } else if (data.action === google.picker.Action.PICKED) {
            const document = data[google.picker.Response.DOCUMENTS][0];
            const id = document?.[google.picker.Document.ID];
            if (id) {
              resolve(id);
            } else {
              resolve(null);
            }
          }
        } catch (err) {
          reject(err);
        }
      });
      importPicker.setVisible(true);
    });
    return result;
  }

  async pickProjectFolder(accessToken: string) {
    const pickerBuilder = await this._exportPickerBuilderRef.get();
    const exportPicker = pickerBuilder.setOAuthToken(accessToken).build();
    const result = await new Promise<string | null>((resolve, reject) => {
      exportPicker.setCallback(async (data) => {
        try {
          if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          } else if (data.action === google.picker.Action.PICKED) {
            const document = data[google.picker.Response.DOCUMENTS][0];
            if (document) {
              const folderId = document[google.picker.Document.ID];
              resolve(folderId);
            } else {
              resolve(null);
            }
          }
        } catch (err) {
          reject(err);
        }
      });
      exportPicker.setVisible(true);
    });
    return result;
  }

  async createProjectFile(folderId: string, blob: File) {
    return this.createFile(folderId, blob);
  }

  async updateProjectFile(fileId: string, blob: File) {
    return this.updateFile(fileId, blob);
  }

  protected async fetchAccount(): Promise<AccountInfo | null> {
    try {
      const account = await this.request<AccountInfo>(
        "GET",
        `/api/auth/account`,
        "json"
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
    try {
      await this._gsiScriptRef.get();
    } catch (err) {
      console.error(err);
    }
    return this._accountRef.get();
  }

  async signIn() {
    if (!this._gsiScriptRef.value) {
      throw new Error("GSI script was not loaded.");
    }
    const account = this._accountRef.value;
    const authClient = google.accounts.oauth2.initCodeClient({
      client_id: BROWSER_GOOGLE_OAUTH_CLIENT_ID,
      scope: SCOPES.join(" "),
      ux_mode: UX_MODE,
      redirect_uri: REDIRECT_URI,
      login_hint: account?.email,
    });
    // Show a popup asking the user for consent to access their data
    // (This must be executed synchronously at the same time as a user interaction,
    // or else iOS Safari will block the popup)
    authClient.requestCode();
    return new Promise<AccountInfo | null>((resolve, reject) => {
      const bindableAuthClient =
        authClient as unknown as google.accounts.oauth2.CodeClientConfig;
      bindableAuthClient.callback = async (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          try {
            await this.request<AccessInfo>(
              "POST",
              `/api/auth/signin`,
              "json",
              `code=${response.code}`,
              "application/x-www-form-urlencoded"
            );
            this._accountRef.reset();
            const accountInfo = await this._accountRef.get();
            resolve(accountInfo);
          } catch (err) {
            reject(err);
          }
        }
      };
      bindableAuthClient.error_callback = (err) => {
        reject(err);
      };
    });
  }

  async signOut() {
    this._accountRef.reset();
    return this.request("POST", `/api/auth/signout`, "json");
  }

  async getAccess() {
    return this.request<AccessInfo>("GET", `/api/auth/access`, "json");
  }

  async getFileRevisions(fileId: string) {
    return this.request<RemoteStorage.Revision[]>(
      "GET",
      `/api/storage/files/${fileId}/revisions`,
      "json"
    );
  }

  async getFileRevision<K extends keyof ResponseTypeMap>(
    fileId: string,
    revisionId: string,
    responseType: K
  ): Promise<ResponseTypeMap[K]> {
    return this.request<ResponseTypeMap[K]>(
      "GET",
      `/api/storage/files/${fileId}/revisions/${revisionId}`,
      responseType
    );
  }

  protected async createFile(folderId: string, blob: Blob) {
    const formData = new FormData();
    formData.append("file", blob);
    return this.request<RemoteStorage.File>(
      "POST",
      `/api/storage/files/${folderId}`,
      "json",
      formData
    );
  }

  protected async updateFile(fileId: string, blob: Blob) {
    const formData = new FormData();
    formData.append("file", blob);
    return this.request<RemoteStorage.File>(
      "PUT",
      `/api/storage/files/${fileId}`,
      "json",
      formData
    );
  }

  getProjectExtension() {
    return `project`;
  }

  getProjectFilename(projectName: string) {
    return `${projectName}.${this.getProjectExtension()}`;
  }
}
