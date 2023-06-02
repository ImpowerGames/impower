import { createDataDocument } from "../../impower-core";
import { CustomizationDocument } from "../types/documents/customizationDocument";

const createCustomizationDocument = (
  doc?: Partial<CustomizationDocument>
): CustomizationDocument => {
  return {
    ...createDataDocument(),
    _documentType: "CustomizationDocument",
    phraseTags: {},
    ...doc,
  };
};

export default createCustomizationDocument;
