import { ServiceAccount } from "firebase-admin";
import { doMigrate, HashParams, UserAccounts } from "./doMigrate";

const fromAccountsPath = "../../prod.accounts.json";
const fromAuthPath = "../../prod.auth.json";
const fromCredentialsPath = "../../prod.credentials.json";
const fromDatabaseURL = "https://impowergames.firebaseio.com";
const fromStorageBucket = "gs://impowergames.appspot.com";
const toCredentialsPath = "../../test.credentials.json";
const toDatabaseURL = "https://impowergames-test-default-rtdb.firebaseio.com/";
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
    console.log("Migrated data from impowergames to impowergames-test");
  } catch (error) {
    console.error(error);
  }
};

migrate();
