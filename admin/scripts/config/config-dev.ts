import { ServiceAccount } from "firebase-admin";
import { publishRemoteConfig } from "./publishRemoteConfig";

const publish = async () => {
  const credentialsPath = "../../dev.credentials.json";
  const credentials = await import(credentialsPath);
  try {
    await publishRemoteConfig(credentials as ServiceAccount);
    console.log("Deployed Remote Configs for impowergames-dev");
  } catch (error) {
    console.error(error);
  }
};

publish();
