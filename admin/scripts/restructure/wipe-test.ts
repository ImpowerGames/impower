import { ServiceAccount } from "firebase-admin";
import { doWipe } from "./doWipe";

const credentialsPath = "../../test.credentials.json";
const databaseURL = "https://impowergames-test-default-rtdb.firebaseio.com/";
const storageBucket = "gs://impowergames-test.appspot.com";

const wipe = async () => {
  const credentials = await import(credentialsPath);
  try {
    await doWipe(
      credentials as ServiceAccount,
      databaseURL,
      storageBucket
    );
    console.log("Wiped data in impowergames-test");
  } catch (error) {
    console.error(error);
  }
};

wipe();
