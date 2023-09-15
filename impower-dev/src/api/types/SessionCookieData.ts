export interface SessionCookieData {
  refresh_token: string;
  provider: "google" | "dropbox" | "github";
  uid: string;
  displayName: string;
  email: string;
  token: string;
  expires: number;
  scope: string;
  consented: boolean;
}
