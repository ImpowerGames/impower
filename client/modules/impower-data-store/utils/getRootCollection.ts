const getRootCollection = (
  docType: string
): "users" | "studios" | "games" | "resources" => {
  switch (docType) {
    case "UserDocument":
      return "users";
    case "StudioDocument":
      return "studios";
    case "GameDocument":
      return "games";
    case "ResourceDocument":
      return "resources";
    default:
      return undefined;
  }
};

export default getRootCollection;
