import { SparkToken } from "../../../sparkdown";
import { clearFormatting } from "./clearFormatting";
import { getToken } from "./getToken";

export const getAuthor = (titleTokens: Record<string, SparkToken[]>) => {
  const tokens = Object.values(titleTokens || {}).flatMap((x) => x);
  const authorToken = getToken(tokens, "author") || getToken(tokens, "authors");
  return authorToken ? clearFormatting(authorToken.text) : "";
};
