import { CommentDocument } from "../types/documents/commentDocument";

const isCommentDocument = (obj: unknown): obj is CommentDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as CommentDocument;
  return doc._documentType === "CommentDocument";
};

export default isCommentDocument;
