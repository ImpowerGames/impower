import { SlugDocument } from "../types/documents/slugDocument";

const isSlugDocument = (obj: unknown): obj is SlugDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as SlugDocument;
  return doc._documentType === "SlugDocument";
};

export default isSlugDocument;
