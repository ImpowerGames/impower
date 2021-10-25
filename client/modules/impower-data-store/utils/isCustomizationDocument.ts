import { CustomizationDocument } from "../types/documents/customizationDocument";

const isCustomizationDocument = (
  obj: unknown
): obj is CustomizationDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as CustomizationDocument;
  return doc._documentType === "CustomizationDocument";
};

export default isCustomizationDocument;
