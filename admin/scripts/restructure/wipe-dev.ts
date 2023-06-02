import { ServiceAccount } from "firebase-admin/app";
import { doWipe } from "./doWipe";

const credentialsPath = "../../dev.credentials.json";
const databaseURL = "https://impowergames-dev.firebaseio.com";
const storageBucket = "gs://impowergames-dev.appspot.com";

const wipe = async () => {
  const credentials = await import(credentialsPath);
  try {
    await doWipe(credentials as ServiceAccount, databaseURL, storageBucket);
    console.log("Wiped data in impowergames-dev");
  } catch (error) {
    console.error(error);
  }
};

wipe();
