import { UserDocument } from "../types/documents/userDocument";

const isUserDocument = (obj: unknown): obj is UserDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as UserDocument;
  return doc._documentType === "UserDocument";
};

export default isUserDocument;
