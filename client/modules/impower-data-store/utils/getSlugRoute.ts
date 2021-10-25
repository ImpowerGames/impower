const getSlugRoute = (docType: string): "u" | "s" | "r" | "g" => {
  switch (docType) {
    case "UserDocument":
      return "u";
    case "StudioDocument":
      return "s";
    case "ResourceDocument":
      return "r";
    case "GameDocument":
      return "g";
    default:
      return undefined;
  }
};

export default getSlugRoute;
