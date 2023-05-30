import { createDataDocument } from "../../impower-core";
import { AccessDocument } from "../types/documents/accessDocument";

const createAccessDocument = (
  doc: Partial<AccessDocument> &
    Pick<AccessDocument, "_documentType"> &
    Pick<AccessDocument, "studio">
): AccessDocument => {
  return {
    ...createDataDocument(),
    ...doc,
    owners: [],
  };
};

export default createAccessDocument;
