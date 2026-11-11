import { getResourceSrcFromPath } from "@impower/sparkdown/src/workspace/utils/resourceUrl";
import { getPathFromUri } from "./getPathFromUri";

export const getSrcFromUri = (uri: string) =>
  getResourceSrcFromPath(getPathFromUri(uri));
