import { FirebaseApp, getApp, initializeApp } from "firebase/app";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import { UserClaims, UserCredential } from "../../impower-auth";
import { MemberData } from "../../impower-data-state";
import { InternalAppCheck } from "../types/aliases";
import { getClientCredentials } from "../utils/getClientCredentials";
import { getToken } from "../utils/getToken";

class API {
  private static _instance: API;

  public static get instance(): API {
    if (!this._instance) {
      this._instance = new API();
    }
    return this._instance;
  }

  private _app: FirebaseApp;

  public get app(): FirebaseApp {
    if (!this._app) {
      try {
        this._app = getApp();
      } catch (e) {
        this._app = initializeApp(getClientCredentials());
      }
    }
    return this._app;
  }

  private _appCheck: InternalAppCheck;

  static getServerDay(clientOffset: number): number {
    const now = Date.now() + clientOffset;
    return Math.trunc(now / 1000 / 60 / 60 / 24);
  }

  verify(): void {
    if (!this._appCheck) {
      this._appCheck = initializeAppCheck(this.app, {
        provider: new CustomProvider({ getToken }),
      });
    }
  }

  async verifyCaptchaClaim(captcha: string): Promise<UserClaims> {
    try {
      const Auth = (await import("../../impower-auth/classes/auth")).default;
      const token = await Auth.instance.currentUser.getIdToken(true);
      const response = await fetch("/api/verifyCaptchaClaim", {
        method: "POST",
        body: JSON.stringify({ token, captcha }),
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message);
      }
      const getClaims = (await import("../../impower-auth/utils/getClaims"))
        .default;
      const claims = await getClaims(true);
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      logInfo("API", "VERIFIED CAPTCHA CLAIM", claims);
      return claims;
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      logError("API", error);
      throw error;
    }
  }

  async verifyUploadClaim(): Promise<string> {
    try {
      const Auth = (await import("../../impower-auth/classes/auth")).default;
      const token = await Auth.instance.currentUser.getIdToken(true);
      const response = await fetch("/api/verifyUploadClaim", {
        method: "POST",
        body: JSON.stringify({ token }),
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as {
        message?: string;
        storageKey?: string;
      };
      if (!response.ok) {
        throw new Error(result.message);
      }
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      const getClaims = (await import("../../impower-auth/utils/getClaims"))
        .default;
      const claims = await getClaims(true);
      logInfo("API", "VERIFIED UPLOAD CLAIM", claims);
      return result?.storageKey;
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      logError("API", error);
      throw error;
    }
  }

  async verifyProjectClaim(project: string): Promise<MemberData> {
    try {
      const Auth = (await import("../../impower-auth/classes/auth")).default;
      const token = await Auth.instance.currentUser.getIdToken(true);
      const response = await fetch("/api/verifyProjectClaim", {
        method: "POST",
        body: JSON.stringify({ token, project }),
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as {
        message?: string;
        member?: MemberData;
      };
      if (!response.ok) {
        throw new Error(result.message);
      }
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      logInfo("API", "VERIFIED PROJECT CLAIM");
      return result.member;
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      logError("API", error);
      throw error;
    }
  }

  async updateProfileClaims(): Promise<UserClaims> {
    try {
      const Auth = (await import("../../impower-auth/classes/auth")).default;
      const token = await Auth.instance.currentUser.getIdToken(true);
      const response = await fetch("/api/updateProfileClaims", {
        method: "POST",
        body: JSON.stringify({ token }),
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.message);
      }
      const getClaims = (await import("../../impower-auth/utils/getClaims"))
        .default;
      const claims = await getClaims(true);
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      logInfo("API", "UPDATED PROFILE CLAIMS", claims);
      Auth.instance.claims = claims;
      return claims;
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      logError("API", error);
      throw error;
    }
  }

  async login(info: {
    email: string;
    password: string;
  }): Promise<UserCredential> {
    const { email, password } = info;
    try {
      const login = (await import("../../impower-auth/utils/login")).default;
      const credential = await login(email, password);
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      logInfo("API", "LOGGED IN", credential);
      return credential;
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      logError("API", error);
      throw error;
    }
    return undefined;
  }

  async signup(info: {
    email: string;
    password: string;
    username: string;
    dob: string;
    captcha: string;
  }): Promise<UserCredential> {
    const { email, password } = info;
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        body: JSON.stringify({ ...info }),
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as {
        message?: string;
      };
      if (!response.ok) {
        throw result;
      }
      const login = (await import("../../impower-auth/utils/login")).default;
      const credential = await login(email, password);
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      logInfo("API", "SIGNED UP", credential);
      return credential;
    } catch (error) {
      const logError = (await import("../../impower-logger/utils/logError"))
        .default;
      logError("API", error);
      throw error;
    }
  }
}

export default API;
