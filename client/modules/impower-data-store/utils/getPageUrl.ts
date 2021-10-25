import { DataDocument } from "../../impower-core";
import getSlugRoute from "./getSlugRoute";
import isGameDocument from "./isGameDocument";
import isResourceDocument from "./isResourceDocument";
import isStudioDocument from "./isStudioDocument";
import isUserDocument from "./isUserDocument";

const getPageUrl = (doc: DataDocument): string => {
  let url = "/{s}/{slug}";
  url = url.replace("{s}", getSlugRoute(doc._documentType).toLowerCase());
  if (isUserDocument(doc)) {
    return url.replace("{slug}", doc.username);
  }
  if (isStudioDocument(doc)) {
    return url.replace("{slug}", doc.handle);
  }
  if (isGameDocument(doc)) {
    return url.replace("{slug}", doc.slug);
  }
  if (isResourceDocument(doc)) {
    return url.replace("{slug}", doc.slug);
  }
  return "";
};

export default getPageUrl;
