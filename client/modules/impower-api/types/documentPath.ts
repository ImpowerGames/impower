export type InfoDocumentPath = ["info", "connected"];

export type HandleDocumentPath = ["handles", string];

export type SlugDocumentPath = ["slugs", string];

export type PhraseDocumentPath = ["phrases", string];
export type PhraseSuggestionDocumentPath =
  | ["phrases", string, "suggestions", string];

export type TagDocumentPath = ["tags", string];

export type UserDocumentPath = ["users", string];
export type UserSubmissionDocumentPath = [
  "users",
  string,
  "submissions",
  string
];
export type UserCustomizationDocumentPath = [
  "users",
  string,
  "customizations",
  string
];
export type UserSettingDocumentPath = ["users", string, "settings", string];
export type UserClaimDocumentPath = ["users", string, "claims", string];
export type UserDeletedSubmissionDocumentPath = [
  "users",
  string,
  "deleted_submissions",
  string
];

export type StudioDocumentPath = ["studios", string];
export type ResourceDocumentPath = ["resources", string];
export type GameDocumentPath = ["games", string];
export type PageDocumentPath = ["studios" | "resources" | "games", string];
export type ProjectDocumentPath = ["resources" | "games", string];

export type PublishedPageDocumentPath = [
  "published_studios" | "published_resources" | "published_games",
  string
];
export type PublishedPageCommentDocumentPath = [
  "pitched_resources" | "pitched_games",
  string,
  "comments",
  string
];

export type PitchedProjectDocumentPath = [
  "pitched_resources" | "pitched_games",
  string
];
export type PitchedProjectContributionDocumentPath = [
  "pitched_resources" | "pitched_games",
  string,
  "contributions",
  string
];

export type ReportableDocumentPath =
  | UserDocumentPath
  | PageDocumentPath
  | ProjectDocumentPath
  | PublishedPageDocumentPath
  | PublishedPageCommentDocumentPath
  | PitchedProjectDocumentPath
  | PitchedProjectContributionDocumentPath;

export type SubmissionDocumentPath =
  | UserDocumentPath
  | PageDocumentPath
  | PublishedPageDocumentPath
  | PublishedPageCommentDocumentPath
  | PitchedProjectDocumentPath
  | PitchedProjectContributionDocumentPath
  | PhraseDocumentPath
  | PhraseSuggestionDocumentPath
  | [...ReportableDocumentPath, "reports", string];

export type InteractiveDocumentPath =
  | UserDocumentPath
  | PhraseDocumentPath
  | TagDocumentPath
  | PublishedPageDocumentPath
  | PitchedProjectDocumentPath
  | ProjectDocumentPath
  | PublishedPageCommentDocumentPath
  | PitchedProjectContributionDocumentPath;

export type DocumentPath =
  | InfoDocumentPath
  | HandleDocumentPath
  | PhraseDocumentPath
  | PhraseSuggestionDocumentPath
  | SlugDocumentPath
  | TagDocumentPath
  | UserDocumentPath
  | UserSubmissionDocumentPath
  | UserCustomizationDocumentPath
  | UserSettingDocumentPath
  | UserClaimDocumentPath
  | UserDeletedSubmissionDocumentPath
  | PageDocumentPath
  | ProjectDocumentPath
  | PublishedPageDocumentPath
  | PublishedPageCommentDocumentPath
  | PitchedProjectDocumentPath
  | PitchedProjectContributionDocumentPath
  | [...ReportableDocumentPath, "reports", string];
