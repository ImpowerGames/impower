export interface AccountInfo {
  uid: string;
  displayName: string;
  photoURL: string;
  email: string;
  token: string;
  expires: number;
  scope: string;
  consented: boolean;
}
