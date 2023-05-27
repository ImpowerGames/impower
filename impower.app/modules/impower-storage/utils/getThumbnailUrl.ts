import { getPrefixedUrl } from "./getPrefixedUrl";

const THUMB_PREFIX = "THUMB_";

export const getThumbnailUrl = (fileUrl: string): string => {
  const replacedPrefixUrl = fileUrl.replace(/(BLUR_|THUMB_)/g, THUMB_PREFIX);
  if (replacedPrefixUrl !== fileUrl) {
    return replacedPrefixUrl;
  }
  return getPrefixedUrl(fileUrl, THUMB_PREFIX);
};
