import { DataPath } from "../../impower-api";

const getDataStorePath = <T extends DataPath>(...pathSegments: T): string => {
  return pathSegments.filter(Boolean).join("/");
};

export default getDataStorePath;
