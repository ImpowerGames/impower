const getTypeName = (docType: string): "User" | "Studio" | "Project" => {
  switch (docType) {
    case "UserDocument":
      return "User";
    case "StudioDocument":
      return "Studio";
    case "ProjectDocument":
      return "Project";
    default:
      return undefined;
  }
};

export default getTypeName;
