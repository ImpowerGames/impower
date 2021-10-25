import { CustomizationType } from "../../impower-api";
import { CustomizationDocument } from "../../impower-data-store";
import {
  UserLoadCustomizationsAction,
  USER_LOAD_CUSTOMIZATIONS,
} from "../types/actions/userLoadCustomizationsAction";

const userLoadCustomizations = (customizations: {
  [customizationType in CustomizationType]: CustomizationDocument;
}): UserLoadCustomizationsAction => {
  return {
    type: USER_LOAD_CUSTOMIZATIONS,
    payload: {
      customizations,
    },
  };
};

export default userLoadCustomizations;
