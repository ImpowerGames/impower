import { ServiceAccount } from "firebase-admin";
import { publishRemoteConfig } from "./publishRemoteConfig";

const publish = async () => {
  const credentialsPath = "../../test.credentials.json";
  const credentials = await import(credentialsPath);
  try {
    await publishRemoteConfig(credentials as ServiceAccount);
    console.log(
      "Deployed Remote Configs for impowergames-test: phrases, terms"
    );
  } catch (error) {
    console.error(error);
  }
};

publish();
