import { DataStatePath } from "../types/dataStatePath";

const getDataStatePath = <T extends DataStatePath>(
  ...pathSegments: T
): string => {
  return pathSegments.filter(Boolean).join("/");
};

export default getDataStatePath;
