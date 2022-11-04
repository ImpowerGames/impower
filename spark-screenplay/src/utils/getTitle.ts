import { SparkToken } from "../../../sparkdown";
import { clearFormatting } from "./clearFormatting";
import { getToken } from "./getToken";

export const getTitle = (titleTokens: Record<string, SparkToken[]>) => {
  const tokens = Object.values(titleTokens || {}).flatMap((x) => x);
  const titleToken = getToken(tokens, "title");
  return titleToken ? clearFormatting(titleToken.text) : "";
};
