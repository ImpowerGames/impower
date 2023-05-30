export type InfoCollectionPath = ["info"];

export type HandleCollectionPath = ["handles"];

export type SlugCollectionPath = ["slugs"];

export type PhraseCollectionPath = ["phrases"];
export type PhraseSuggestionCollectionPath = ["phrases", string, "suggestions"];

export type TagCollectionPath = ["tags"];

export type UserCollectionPath = ["users"];
export type UserSubmissionCollectionPath = ["users", string, "submissions"];
export type UserCustomizationCollectionPath = [
  "users",
  string,
  "customizations"
];
export type UserSettingCollectionPath = ["users", string, "settings"];
export type UserClaimCollectionPath = ["users", string, "claims"];
export type UserDeletedSubmissionCollectionPath = [
  "users",
  string,
  "deleted_submissions"
];

export type PageCollectionPath = ["studios" | "projects"];
export type ProjectCollectionPath = ["projects"];

export type PublishedPageCollectionPath = [
  "published_studios" | "published_projects"
];
export type PublishedPageCommentCollectionPath = [
  "pitched_projects",
  string,
  "comments"
];

export type PitchedProjectCollectionPath = ["pitched_projects"];
export type PitchedProjectContributionCollectionPath = [
  "pitched_projects",
  string,
  "contributions"
];
export type PitchedProjectContributionNoteCollectionPath = [
  "pitched_projects",
  string,
  "contributions",
  string,
  "notes"
];
export type PitchedProjectNoteCollectionPath = [
  "pitched_projects",
  string,
  "notes"
];
export type PitchedProjectNoteCollectionGroupPath = [undefined, "notes"];

export type ContributionCollectionGroupPath = [undefined, "contributions"];
export type NoteCollectionGroupPath = [undefined, "notes"];

export type CollectionPath =
  | InfoCollectionPath
  | HandleCollectionPath
  | PhraseCollectionPath
  | PhraseSuggestionCollectionPath
  | SlugCollectionPath
  | TagCollectionPath
  | UserCollectionPath
  | UserSubmissionCollectionPath
  | UserCustomizationCollectionPath
  | UserSettingCollectionPath
  | UserClaimCollectionPath
  | UserDeletedSubmissionCollectionPath
  | PageCollectionPath
  | ProjectCollectionPath
  | PublishedPageCollectionPath
  | PublishedPageCommentCollectionPath
  | PitchedProjectCollectionPath
  | PitchedProjectContributionCollectionPath
  | PitchedProjectNoteCollectionPath
  | PitchedProjectContributionNoteCollectionPath
  | ContributionCollectionGroupPath
  | NoteCollectionGroupPath;
