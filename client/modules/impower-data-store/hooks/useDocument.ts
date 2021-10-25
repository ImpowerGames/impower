import { DocumentPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";
import { useDocumentLoad } from "./useDocumentLoad";

export const useDocument = <T extends DataDocument>(
  ...path: DocumentPath
): T => {
  return useDocumentLoad(undefined, ...path);
};
