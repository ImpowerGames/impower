import { ServiceAccount } from "firebase-admin";
import { publishRemoteConfig } from "./publishRemoteConfig";

const config = async () => {
  const alias = process.argv[2]
  const credentialsPath = `../../${alias}.credentials.json`;
  const credentials = await import(credentialsPath);
  try {
    await publishRemoteConfig(credentials as ServiceAccount);
    const project = alias === "prod" ? "impowergames" : `impowergames-${alias}`
    console.log(`Deployed Remote Configs for project: ${project}`);
  } catch (error) {
    console.error(error);
  }
};

config();
