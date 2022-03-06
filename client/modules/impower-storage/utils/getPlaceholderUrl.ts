import { getPrefixedUrl } from "./getPrefixedUrl";

const BLUR_PREFIX = "BLUR_";

export const getPlaceholderUrl = (fileUrl: string): string => {
  const replacedPrefixUrl = fileUrl.replace(/(BLUR_|THUMB_)/g, BLUR_PREFIX);
  if (replacedPrefixUrl !== fileUrl) {
    return replacedPrefixUrl;
  }
  return getPrefixedUrl(fileUrl, "", BLUR_PREFIX);
};
