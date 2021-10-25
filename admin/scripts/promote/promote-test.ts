import { ServiceAccount } from "firebase-admin";
import { HashParams, promoteAuth, UserAccounts } from "./promoteAuth";

const fromAuthPath = "../../dev.auth.json";
const toCredentialsPath = "../../test.credentials.json";
const accountsPath = "../../dev.accounts.json";

const promote = async () => {
  const fromAuth = await import(fromAuthPath);
  const toCredentials = await import(toCredentialsPath);
  const accounts = await import(accountsPath);
  try {
    await promoteAuth(
      fromAuth as HashParams,
      toCredentials as ServiceAccount,
      accounts as UserAccounts
    );
    console.log("Promoted data from impowergames-dev to impowergames-test");
  } catch (error) {
    console.error(error);
  }
};

promote();
