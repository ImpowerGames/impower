import { getPrefixedUrl } from "./getPrefixedUrl";

const BLUR_PREFIX = "BLUR_";

export const getPlaceholderUrl = (fileUrl: string): string => {
  return getPrefixedUrl(fileUrl, "", BLUR_PREFIX);
};
