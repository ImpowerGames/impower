import { ServiceAccount } from "firebase-admin/app";
import { doRestructure } from "./doRestructure";

const credentialsPath = "../../test.credentials.json";
const databaseURL = "https://impowergames-test-default-rtdb.firebaseio.com/";

const restructure = async () => {
  const credentials = await import(credentialsPath);
  try {
    await doRestructure(credentials as ServiceAccount, databaseURL);
    console.log("Restructued data in impowergames-test");
  } catch (error) {
    console.error(error);
  }
};

restructure();
