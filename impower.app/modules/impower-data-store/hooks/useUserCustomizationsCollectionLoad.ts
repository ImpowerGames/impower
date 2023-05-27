import { CustomizationDocument } from "../types/documents/customizationDocument";
import { useDefaultCollectionLoad } from "./useDefaultCollectionLoad";

export const useUserCustomizationsCollectionLoad = (
  onLoad: (docs: { [id: string]: CustomizationDocument }) => void,
  uid: string
): void => {
  useDefaultCollectionLoad(
    onLoad,
    {
      phrase_additions: null,
      phrase_deletions: null,
    },
    "users",
    uid,
    "customizations"
  );
};
