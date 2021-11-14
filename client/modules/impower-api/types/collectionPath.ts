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

export type PageCollectionPath = ["studios" | "resources" | "games"];
export type ProjectCollectionPath = ["resources" | "games"];

export type PublishedPageCollectionPath = [
  "published_studios" | "published_resources" | "published_games"
];
export type PublishedPageCommentCollectionPath = [
  "pitched_resources" | "pitched_games",
  string,
  "comments"
];

export type PitchedProjectCollectionPath = [
  "pitched_resources" | "pitched_games"
];
export type PitchedProjectContributionCollectionPath = [
  "pitched_resources" | "pitched_games",
  string,
  "contributions"
];
export type PitchedProjectContributionNoteCollectionPath = [
  "pitched_resources" | "pitched_games",
  string,
  "contributions",
  string,
  "notes"
];
export type PitchedProjectNoteCollectionPath = [
  "pitched_resources" | "pitched_games",
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
