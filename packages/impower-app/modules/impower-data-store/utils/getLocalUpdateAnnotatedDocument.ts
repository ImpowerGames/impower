import { DataDocument } from "../../impower-core";
import getLocalDocumentUpdateMetadata from "./getLocalDocumentUpdateMetadata";

const getLocalUpdateAnnotatedDocument = <T extends DataDocument>(
  doc?: T
): T => {
  return {
    ...(doc || {}),
    ...getLocalDocumentUpdateMetadata(doc),
  } as T;
};

export default getLocalUpdateAnnotatedDocument;
