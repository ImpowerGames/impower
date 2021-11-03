export type InfoCollectionPath = ["info"];

export type HandleCollectionPath = ["handles"];

export type SlugCollectionPath = ["slugs"];

export type PhraseCollectionPath = ["phrases"];
export type PhraseSuggestionCollectionPath = ["phrases", string, "suggestions"];

export type TagCollectionPath = ["tags"];
export type TagReportCollectionPath = ["tags", string, "reports"];

export type UserCollectionPath = ["users"];
export type UserSubmissionCollectionPath = ["users", string, "submissions"];
export type UserCustomizationCollectionPath = [
  "users",
  string,
  "customizations"
];
export type UserSettingCollectionPath = ["users", string, "settings"];
export type UserClaimCollectionPath = ["users", string, "claims"];
export type UserReportCollectionPath = ["users", string, "reports"];
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
export type PublishedPageReportCollectionPath = [
  "pitched_resources" | "pitched_games",
  string,
  "reports"
];

export type PitchedProjectCollectionPath = [
  "pitched_resources" | "pitched_games"
];
export type PitchedProjectContributionCollectionPath = [
  "pitched_resources" | "pitched_games",
  string,
  "contributions"
];
export type PitchedProjectContributionCollectionGroupPath = [
  undefined,
  "contributions"
];
export type PitchedProjectReportCollectionPath = [
  "pitched_resources" | "pitched_games",
  string,
  "reports"
];

export type CollectionPath =
  | InfoCollectionPath
  | HandleCollectionPath
  | PhraseCollectionPath
  | PhraseSuggestionCollectionPath
  | SlugCollectionPath
  | TagCollectionPath
  | TagReportCollectionPath
  | UserCollectionPath
  | UserSubmissionCollectionPath
  | UserCustomizationCollectionPath
  | UserSettingCollectionPath
  | UserClaimCollectionPath
  | UserReportCollectionPath
  | UserDeletedSubmissionCollectionPath
  | PageCollectionPath
  | ProjectCollectionPath
  | PublishedPageCollectionPath
  | PublishedPageCommentCollectionPath
  | PublishedPageReportCollectionPath
  | PitchedProjectCollectionPath
  | PitchedProjectContributionCollectionPath
  | PitchedProjectReportCollectionPath
  | PitchedProjectContributionCollectionGroupPath;
