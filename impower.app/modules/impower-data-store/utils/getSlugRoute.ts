const getSlugRoute = (docType: string): "u" | "s" | "r" => {
  switch (docType) {
    case "UserDocument":
      return "u";
    case "StudioDocument":
      return "s";
    case "ProjectDocument":
      return "r";
    default:
      return undefined;
  }
};

export default getSlugRoute;
