const getTypeName = (
  docType: string
): "User" | "Studio" | "Resource" | "Game" => {
  switch (docType) {
    case "UserDocument":
      return "User";
    case "StudioDocument":
      return "Studio";
    case "ResourceDocument":
      return "Resource";
    case "GameDocument":
      return "Game";
    default:
      return undefined;
  }
};

export default getTypeName;
