import { ServiceAccount } from "firebase-admin/app";
import { doCleanup } from "./doCleanup";

const credentialsPath = "../../prod.credentials.json";
const databaseURL = "https://impowergames.firebaseio.com";

const cleanup = async () => {
  const credentials = await import(credentialsPath);
  try {
    await doCleanup(credentials as ServiceAccount, databaseURL);
    console.log("Restructued data in impowergames");
  } catch (error) {
    console.error(error);
  }
};

cleanup();
