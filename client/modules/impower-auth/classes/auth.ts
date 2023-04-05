import { getApp, initializeApp } from "firebase/app";
import { browserLocalPersistence, initializeAuth } from "firebase/auth";
import { getClientCredentials } from "../../impower-api";
import { InternalAuth, User } from "../types/aliases";
import { AuthorAttributes } from "../types/interfaces/authorAttributes";
import { UserAttributes } from "../types/interfaces/userAttributes";
import { UserClaims } from "../types/interfaces/userClaims";
import connectAuthEmulator from "../utils/connectAuthEmulator";

class Auth {
  private static _instance: Auth;

  public static get instance(): Auth {
    if (!this._instance) {
      this._instance = new Auth();
    }
    return this._instance;
  }

  private _internal: InternalAuth;

  public get internal(): InternalAuth {
    if (!this._internal) {
      let app;
      try {
        app = getApp();
      } catch (e) {
        app = initializeApp(getClientCredentials());
      }
      try {
        this._internal = initializeAuth(app, {
          persistence: [browserLocalPersistence],
          popupRedirectResolver: undefined,
        });
        if (process.env.NEXT_PUBLIC_EMULATOR_HOST) {
          console.warn("USING AUTH EMULATOR");
          connectAuthEmulator(this._internal);
        }
      } catch (e) {
        console.warn(e);
        // already connected
      }
    }
    return this._internal;
  }

  get currentUser(): User {
    return this.internal.currentUser;
  }

  get uid(): string {
    return this.internal.currentUser?.uid || null;
  }

  get attributes(): UserAttributes {
    const user = this.internal.currentUser;
    return {
      uid: user?.uid || null,
      email: user?.email || null,
      emailVerified: user?.emailVerified || null,
      phoneNumber: user?.phoneNumber || null,
      isAnonymous: user?.isAnonymous || null,
    };
  }

  get author(): AuthorAttributes {
    const user = this.internal.currentUser;
    if (!user) {
      return {
        u: null,
        i: null,
        h: null,
      };
    }
    return {
      u: this.claims?.username || user.displayName || null,
      i: this.claims?.icon || user.photoURL || null,
      h: this.claims?.hex || null,
    };
  }

  claims: UserClaims;

  tempEmail: string = null;

  tempUsername: string = null;
}

export default Auth;
