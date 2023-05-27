import { SettingsDocument } from "../types/documents/settingsDocument";
import { useDefaultCollectionLoad } from "./useDefaultCollectionLoad";

export const useUserSettingsCollectionLoad = (
  onLoad: (docs: { [id: string]: SettingsDocument }) => void,
  uid: string
): void => {
  useDefaultCollectionLoad(
    onLoad,
    {
      account: null,
    },
    "users",
    uid,
    "settings"
  );
};
