import { ServiceAccount } from "firebase-admin";
import { doMigrate, HashParams, UserAccounts } from "./doMigrate";

const fromAccountsPath = "../../test.accounts.json";
const fromAuthPath = "../../test.auth.json";
const fromCredentialsPath = "../../test.credentials.json";
const fromDatabaseURL = "https://impowergames-test-default-rtdb.firebaseio.com/";
const fromStorageBucket = "gs://impowergames-test.appspot.com";
const toCredentialsPath = "../../prod.credentials.json";
const toDatabaseURL = "https://impowergames.firebaseio.com";
const toStorageBucket = "gs://impowergames.appspot.com";


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
    console.log("Migrated data from impowergames-test to impowergames");
  } catch (error) {
    console.error(error);
  }
};

migrate();
