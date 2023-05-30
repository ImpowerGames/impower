import { ClaimsDocument } from "../types/documents/claimsDocument";

const isClaimsDocument = (obj: unknown): obj is ClaimsDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as ClaimsDocument;
  return doc._documentType === "ClaimsDocument";
};

export default isClaimsDocument;
