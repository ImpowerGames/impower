import { getPrefixedUrl } from "./getPrefixedUrl";

const SFW_PREFIX = "SFW_";

export const getSfwUrl = (fileUrl: string): string => {
  return getPrefixedUrl(fileUrl, "", SFW_PREFIX);
};
