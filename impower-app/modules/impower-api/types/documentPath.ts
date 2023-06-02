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
export type PageDocumentPath = ["studios" | "projects", string];
export type ProjectDocumentPath = ["projects", string];

export type PublishedPageDocumentPath = [
  "published_studios" | "published_projects",
  string
];
export type PublishedPageCommentDocumentPath = [
  "pitched_projects",
  string,
  "comments",
  string
];

export type PitchedProjectDocumentPath = ["pitched_projects", string];
export type PitchedProjectContributionDocumentPath = [
  "pitched_projects",
  string,
  "contributions",
  string
];
export type PitchedProjectNoteDocumentPath = [
  "pitched_projects",
  string,
  "notes",
  string
];

export type ReportableDocumentPath =
  | UserDocumentPath
  | PageDocumentPath
  | ProjectDocumentPath
  | PublishedPageDocumentPath
  | PublishedPageCommentDocumentPath
  | PitchedProjectDocumentPath
  | PitchedProjectContributionDocumentPath
  | PitchedProjectNoteDocumentPath;

export type SubmissionDocumentPath =
  | UserDocumentPath
  | PageDocumentPath
  | PublishedPageDocumentPath
  | PublishedPageCommentDocumentPath
  | PitchedProjectDocumentPath
  | PitchedProjectContributionDocumentPath
  | PitchedProjectNoteDocumentPath
  | PhraseDocumentPath
  | PhraseSuggestionDocumentPath;

export type InteractiveDocumentPath =
  | UserDocumentPath
  | PhraseDocumentPath
  | TagDocumentPath
  | PublishedPageDocumentPath
  | PitchedProjectDocumentPath
  | ProjectDocumentPath
  | PublishedPageCommentDocumentPath
  | PitchedProjectContributionDocumentPath
  | PitchedProjectNoteDocumentPath;

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
  | PitchedProjectNoteDocumentPath;
