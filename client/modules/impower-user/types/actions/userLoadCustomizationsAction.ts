import { CustomizationType } from "../../../impower-api";
import { CustomizationDocument } from "../../../impower-data-store";

export const USER_LOAD_CUSTOMIZATIONS =
  "@impower/user/USER_LOAD_CUSTOMIZATIONS";
export interface UserLoadCustomizationsAction {
  type: typeof USER_LOAD_CUSTOMIZATIONS;
  payload: {
    customizations: {
      [customizationType in CustomizationType]: CustomizationDocument;
    };
  };
}
