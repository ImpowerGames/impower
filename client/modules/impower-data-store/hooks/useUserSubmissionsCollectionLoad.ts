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
      games: null,
      resources: null,
      phrases: null,
      contributions: null,
      comments: null,
      suggestions: null,
      members: null,
    },
    "users",
    uid,
    "submissions"
  );
};
