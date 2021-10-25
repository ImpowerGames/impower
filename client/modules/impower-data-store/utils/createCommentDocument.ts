import { createDataDocument } from "../../impower-core";
import { Timestamp } from "../../impower-core/types/interfaces/timestamp";
import { CommentDocument } from "../types/documents/commentDocument";

const createCommentDocument = (
  doc?: Partial<CommentDocument>
): CommentDocument => ({
  ...createDataDocument(),
  _documentType: "CommentDocument",
  _createdAt: new Timestamp(),
  content: "",
  commented: true,
  delisted: false,
  score: 1,
  likes: 1,
  dislikes: 0,
  ...doc,
});

export default createCommentDocument;
