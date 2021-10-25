export interface UserClaims {
  username?: string;
  icon?: string;
  hex?: string;
  dob?: string;
  captcha_time?: number;
  storage?: { uploads: number; day: number; id: string; key: string };
}
