import { ServiceAccount } from "firebase-admin/app";
import { doRestructure } from "./doRestructure";

const credentialsPath = "../../dev.credentials.json";
const databaseURL = "https://impowergames-dev.firebaseio.com";

const restructure = async () => {
  const credentials = await import(credentialsPath);
  try {
    await doRestructure(credentials as ServiceAccount, databaseURL);
    console.log("Restructued data in impowergames-dev");
  } catch (error) {
    console.error(error);
  }
};

restructure();
