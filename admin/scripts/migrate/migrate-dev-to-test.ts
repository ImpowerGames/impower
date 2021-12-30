import { ServiceAccount } from "firebase-admin";
import { doMigrate, HashParams, UserAccounts } from "./doMigrate";

const fromAccountsPath = "../../dev.accounts.json";
const fromAuthPath = "../../dev.auth.json";
const fromCredentialsPath = "../../dev.credentials.json";
const fromDatabaseURL = "https://impowergames-dev.firebaseio.com";
const fromStorageBucket = "gs://impowergames-dev.appspot.com";
const toCredentialsPath = "../../test.credentials.json";
const toDatabaseURL = "https://impowergames-test.firebaseio.com";
const toStorageBucket = "gs://impowergames-test.appspot.com";

const migrate = async () => {
  const fromAccounts: UserAccounts = await import(fromAccountsPath);
  const fromAuth: HashParams = await import(fromAuthPath);
  const fromCredentials: ServiceAccount = await import(fromCredentialsPath);
  const toCredentials: ServiceAccount = await import(toCredentialsPath);
  try {
    await doMigrate(
      fromAccounts,
      fromAuth,
      fromCredentials,
      fromDatabaseURL,
      fromStorageBucket,
      toCredentials,
      toDatabaseURL,
      toStorageBucket
    );
    console.log("Migrated data from impowergames-dev to impowergames-test");
  } catch (error) {
    console.error(error);
  }
};

migrate();
