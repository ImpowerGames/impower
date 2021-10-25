import { DataDocumentType } from "../../impower-core";

const getCollectionType = (
  collection:
    | "users"
    | "studios"
    | "games"
    | "resources"
    | "published_studios"
    | "published_resources"
    | "pitched_resources"
    | "published_games"
    | "pitched_games"
    | "tags"
    | "comments"
    | "contributions"
    | "reports"
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
    case "games":
      return "GameDocument";
    case "resources":
      return "ResourceDocument";
    case "published_studios":
      return "StudioDocument";
    case "published_resources":
      return "ResourceDocument";
    case "published_games":
      return "GameDocument";
    case "pitched_games":
      return "GameDocument";
    case "tags":
      return "TagDocument";
    case "comments":
      return "CommentDocument";
    case "contributions":
      return "ContributionDocument";
    case "reports":
      return "ReportDocument";
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
