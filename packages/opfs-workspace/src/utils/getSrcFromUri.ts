import { getPathFromUri } from "./getPathFromUri";

const RESOURCE_PROTOCOL: string = "/file:/";

export const getSrcFromUri = (uri: string) => {
  const path = getPathFromUri(uri);
  return RESOURCE_PROTOCOL + path;
};
