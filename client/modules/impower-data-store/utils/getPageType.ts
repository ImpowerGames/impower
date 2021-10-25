import { DataDocumentType } from "../../impower-core";

const getPageType = (slugRoute: string): DataDocumentType => {
  switch (slugRoute) {
    case "u":
      return "UserDocument";
    case "s":
      return "StudioDocument";
    case "r":
      return "ResourceDocument";
    case "g":
      return "GameDocument";
    default:
      return undefined;
  }
};

export default getPageType;
