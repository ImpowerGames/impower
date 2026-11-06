export interface AccountInfo {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
  token: string;
  expires: number;
  scope: string;
  consented: boolean;
  offline: boolean;
}
