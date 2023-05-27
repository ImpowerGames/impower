import { PageDocument } from "../../impower-data-store";
import { useAllDocsLoad } from "./useAllDocsLoad";

export const useAllDocs = <T extends PageDocument>(
  parent: "studios" | "projects",
  ids: string[]
): { [id: string]: T } => {
  return useAllDocsLoad(undefined, parent, ids);
};
