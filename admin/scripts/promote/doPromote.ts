import * as admin from "firebase-admin";
import { ServiceAccount } from "firebase-admin";

export interface HashParams {
  algorithm: admin.auth.HashAlgorithmType;
  base64_signer_key: string;
  base64_salt_separator: string;
  rounds: number;
  mem_cost: number;
}

export interface UserAccounts {
  users: {
    localId: string;
    email: string;
    emailVerified: boolean;
    displayName: string;
    disabled?: boolean;
    customAttributes: string;
    providerUserInfo: admin.auth.UserProviderRequest[];
    passwordHash: string;
    salt: string;
  }[];
}

export const doPromote = async (
  fromAuth: HashParams,
  toCredentials: ServiceAccount,
  accounts: UserAccounts
) => {
  const toApp = admin.initializeApp(
    {
      credential: admin.credential.cert(toCredentials),
    },
    "to"
  );
  const userImportRecords: admin.auth.UserImportRecord[] = [];
  let i = 0;
  while (i < accounts.users.length) {
    const r = accounts.users[i];
    const existingUser = await toApp
      .auth()
      .getUserByEmail(r.email)
      .catch(() => null);
    if (!existingUser) {
      userImportRecords.push({
        uid: r.localId,
        email: r.email,
        emailVerified: r.emailVerified,
        displayName: r.displayName,
        disabled: r.disabled,
        providerData: r.providerUserInfo,
        customClaims: JSON.parse(r.customAttributes || "{}"),
        passwordHash: Buffer.from(r.passwordHash, "base64"),
        passwordSalt: Buffer.from(r.salt, "base64"),
      });
    }
    i += 1;
  }
  // All the parameters below can be obtained from the Firebase Console's users section.
  const options = {
    hash: {
      algorithm: fromAuth.algorithm,
      key: Buffer.from(fromAuth.base64_signer_key, "base64"),
      saltSeparator: Buffer.from(fromAuth.base64_salt_separator, "base64"),
      rounds: fromAuth.rounds,
      memoryCost: fromAuth.mem_cost,
    },
  };
  await toApp.auth().importUsers(userImportRecords, options);
};
