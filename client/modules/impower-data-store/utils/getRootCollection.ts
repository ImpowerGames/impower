const getRootCollection = (
  docType: string
): "users" | "studios" | "projects" => {
  switch (docType) {
    case "UserDocument":
      return "users";
    case "StudioDocument":
      return "studios";
    case "ProjectDocument":
      return "projects";
    default:
      return undefined;
  }
};

export default getRootCollection;
