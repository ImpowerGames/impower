import { DataDocumentType } from "../../impower-core";

const getCollectionType = (
  collection:
    | "users"
    | "studios"
    | "projects"
    | "published_studios"
    | "published_projects"
    | "pitched_projects"
    | "tags"
    | "comments"
    | "notes"
    | "contributions"
    | "phrases"
    | "suggestions"
    | "phrase_additions"
    | "phrase_deletions"
    | "members"
): DataDocumentType => {
  switch (collection) {
    case "users":
      return "UserDocument";
    case "studios":
      return "StudioDocument";
    case "projects":
      return "ProjectDocument";
    case "published_studios":
      return "StudioDocument";
    case "published_projects":
      return "ProjectDocument";
    case "pitched_projects":
      return "ProjectDocument";
    case "tags":
      return "TagDocument";
    case "comments":
      return "CommentDocument";
    case "notes":
      return "NoteDocument";
    case "contributions":
      return "ContributionDocument";
    case "phrases":
      return "PhraseDocument";
    case "suggestions":
      return "SuggestionDocument";
    case "phrase_additions":
      return "SuggestionDocument";
    case "phrase_deletions":
      return "SuggestionDocument";
    default:
      return undefined;
  }
};

export default getCollectionType;
