export interface AccountInfo {
  uid: string;
  displayName: string;
  email: string;
  token: string;
  expires: number;
  scope: string;
  consented: boolean;
}
