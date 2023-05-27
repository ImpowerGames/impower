import { PathDocument } from "../types/documents/pathDocument";

const createPathDocument = (
  doc?: Partial<PathDocument> & Pick<PathDocument, "path">
): PathDocument => ({
  _documentType: "PathDocument",
  ...doc,
});

export default createPathDocument;
