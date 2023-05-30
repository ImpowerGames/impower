import { DataDocument } from "../../impower-core";
import getLocalDocumentCreateMetadata from "./getLocalDocumentCreateMetadata";

const getLocalCreateAnnotatedDocument = <T extends DataDocument>(
  doc?: T
): T => {
  return {
    ...(doc || {}),
    ...getLocalDocumentCreateMetadata(),
  } as T;
};

export default getLocalCreateAnnotatedDocument;
