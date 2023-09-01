export interface SessionCookieData {
  provider: "google" | "dropbox" | "github";
  refresh_token: string;
}
