import { getPrefixedUrl } from "./getPrefixedUrl";

const THUMB_PREFIX = "THUMB_";

export const getThumbnailUrl = (fileUrl: string): string => {
  return getPrefixedUrl(fileUrl, "", THUMB_PREFIX);
};
