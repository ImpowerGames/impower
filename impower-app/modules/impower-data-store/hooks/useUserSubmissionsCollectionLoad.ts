import { PathDocument } from "../types/documents/pathDocument";
import { useDefaultCollectionLoad } from "./useDefaultCollectionLoad";

export const useUserSubmissionsCollectionLoad = (
  onLoad: (docs: { [id: string]: PathDocument }) => void,
  uid: string
): void => {
  useDefaultCollectionLoad(
    onLoad,
    {
      studios: null,
      projects: null,
      phrases: null,
      contributions: null,
      comments: null,
      notes: null,
      suggestions: null,
      members: null,
    },
    "users",
    uid,
    "submissions"
  );
};
