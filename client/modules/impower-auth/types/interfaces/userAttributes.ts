export interface UserAttributes {
  uid?: string; // Unique user id used for authorization
  email?: string;
  emailVerified?: boolean;
  phoneNumber?: string;
  isAnonymous?: boolean;
}
