import { ServiceAccount } from "firebase-admin";
import { HashParams, promoteAuth, UserAccounts } from "./promoteAuth";

const fromAuthPath = "../../test.auth.json";
const toCredentialsPath = "../../prod.credentials.json";
const accountsPath = "../../test.accounts.json";

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
    console.log("Promoted data from impowergames-test to impowergames");
  } catch (error) {
    console.error(error);
  }
};

promote();
