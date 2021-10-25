import { DataPath } from "../../impower-api";

const getDataStoreKey = <T extends DataPath>(...pathSegments: T): string => {
  return pathSegments.filter(Boolean).join("%");
};

export default getDataStoreKey;
