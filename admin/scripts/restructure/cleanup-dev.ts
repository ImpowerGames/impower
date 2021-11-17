import { ServiceAccount } from "firebase-admin";
import { doCleanup } from "./doCleanup";

const credentialsPath = "../../dev.credentials.json";
const databaseURL = "https://impowergames-dev.firebaseio.com";

const cleanup = async () => {
  const credentials = await import(credentialsPath);
  try {
    await doCleanup(
      credentials as ServiceAccount,
      databaseURL
    );
    console.log("Restructued data in impowergames-dev");
  } catch (error) {
    console.error(error);
  }
};

cleanup();
