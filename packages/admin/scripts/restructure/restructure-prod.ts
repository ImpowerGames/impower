import { ServiceAccount } from "firebase-admin/app";
import { doRestructure } from "./doRestructure";

const credentialsPath = "../../prod.credentials.json";
const databaseURL = "https://impowergames.firebaseio.com";

const restructure = async () => {
  const credentials = await import(credentialsPath);
  try {
    await doRestructure(credentials as ServiceAccount, databaseURL);
    console.log("Restructued data in impowergames");
  } catch (error) {
    console.error(error);
  }
};

restructure();
