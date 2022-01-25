import {
  ActivityType,
  InteractiveDocumentPath,
  PageDocumentPath,
  PhraseDocumentPath,
  PitchedProjectContributionDocumentPath,
  PitchedProjectDocumentPath,
  ProjectDocumentPath,
  PublishedPageCommentDocumentPath,
  PublishedPageDocumentPath,
  TagDocumentPath,
  UserDocumentPath,
} from "../../impower-api";

export type InfoReadPath = [".info", "connected"];

export type MessageWritePath = ["messages", string];

export type ExportReadPath = ["exports", string];
export type ExportWritePath = ["exports", string];

export type PhraseAggReadPath =
  | [...PhraseDocumentPath, "agg", "suggestions", "count"]
  | [...PhraseDocumentPath, "agg", "score"]
  | [...PhraseDocumentPath, "agg", "rating"]
  | [...PhraseDocumentPath, "agg", "rank"]
  | [...PhraseDocumentPath, "agg", "likes", "count"]
  | [...PhraseDocumentPath, "agg", "likes", "data", string]
  | [...PhraseDocumentPath, "agg", "dislikes", "count"]
  | [...PhraseDocumentPath, "agg", "dislikes", "data", string]
  | [...PhraseDocumentPath, "agg", "reports", "count"]
  | [...PhraseDocumentPath, "agg", "reports", "data", string];
export type PhraseAggWritePath =
  | [...PhraseDocumentPath, "agg", "likes"]
  | [...PhraseDocumentPath, "agg", "dislikes"]
  | [...PhraseDocumentPath, "agg", "reports"];

export type TagAggReadPath =
  | [...TagDocumentPath, "agg", "users"]
  | [...TagDocumentPath, "agg", "users", "count"]
  | [...TagDocumentPath, "agg", "studios"]
  | [...TagDocumentPath, "agg", "studios", "count"]
  | [...TagDocumentPath, "agg", "game"]
  | [...TagDocumentPath, "agg", "game", "count"]
  | [...TagDocumentPath, "agg", "story"]
  | [...TagDocumentPath, "agg", "story", "count"]
  | [...TagDocumentPath, "agg", "character"]
  | [...TagDocumentPath, "agg", "character", "count"]
  | [...TagDocumentPath, "agg", "setting"]
  | [...TagDocumentPath, "agg", "setting", "count"]
  | [...TagDocumentPath, "agg", "prop"]
  | [...TagDocumentPath, "agg", "prop", "count"]
  | [...TagDocumentPath, "agg", "interface"]
  | [...TagDocumentPath, "agg", "interface", "count"]
  | [...TagDocumentPath, "agg", "music"]
  | [...TagDocumentPath, "agg", "music", "count"]
  | [...TagDocumentPath, "agg", "sound"]
  | [...TagDocumentPath, "agg", "sound", "count"]
  | [...TagDocumentPath, "agg", "voice"]
  | [...TagDocumentPath, "agg", "voice", "count"]
  | [...TagDocumentPath, "agg", "follows", "count"]
  | [...TagDocumentPath, "agg", "follows", "data", string]
  | [...TagDocumentPath, "agg", "reports", "count"]
  | [...TagDocumentPath, "agg", "reports", "data", string];
export type TagAggWritePath =
  | [...TagDocumentPath, "agg", "follows"]
  | [...TagDocumentPath, "agg", "reports"];
export type TagAggQueryPath =
  | [...TagDocumentPath, "agg", "follows", "data"]
  | [...TagDocumentPath, "agg", "reports", "data"];

export type UserAggReadPath =
  | [...UserDocumentPath, "agg", "my_memberships", "public"]
  | [...UserDocumentPath, "agg", "my_memberships", "count"]
  | [...UserDocumentPath, "agg", "my_memberships", "data"]
  | [...UserDocumentPath, "agg", "my_memberships", "data", string]
  | [...UserDocumentPath, "agg", "my_follows", "public"]
  | [...UserDocumentPath, "agg", "my_follows", "count"]
  | [...UserDocumentPath, "agg", "my_follows", "data"]
  | [...UserDocumentPath, "agg", "my_follows", "data", string]
  | [...UserDocumentPath, "agg", "my_connects", "public"]
  | [...UserDocumentPath, "agg", "my_connects", "count"]
  | [...UserDocumentPath, "agg", "my_connects", "data"]
  | [...UserDocumentPath, "agg", "my_connects", "data", string]
  | [...UserDocumentPath, "agg", "my_kudos", "public"]
  | [...UserDocumentPath, "agg", "my_kudos", "count"]
  | [...UserDocumentPath, "agg", "my_kudos", "data"]
  | [...UserDocumentPath, "agg", "my_kudos", "data", string]
  | [...UserDocumentPath, "agg", "my_submissions", "public"]
  | [...UserDocumentPath, "agg", "my_submissions", "count"]
  | [...UserDocumentPath, "agg", "my_submissions", "data"]
  | [...UserDocumentPath, "agg", "my_submissions", "data", string]
  | [...UserDocumentPath, "agg", "my_likes", "count"]
  | [...UserDocumentPath, "agg", "my_likes", "data"]
  | [...UserDocumentPath, "agg", "my_likes", "data", string]
  | [...UserDocumentPath, "agg", "my_dislikes", "count"]
  | [...UserDocumentPath, "agg", "my_dislikes", "data"]
  | [...UserDocumentPath, "agg", "my_dislikes", "data", string]
  | [...UserDocumentPath, "agg", "my_reports", "count"]
  | [...UserDocumentPath, "agg", "my_reports", "data"]
  | [...UserDocumentPath, "agg", "my_reports", "data", string]
  | [...UserDocumentPath, "agg", "connects", "count"]
  | [...UserDocumentPath, "agg", "connects", "data"]
  | [...UserDocumentPath, "agg", "connects", "data", string]
  | [...UserDocumentPath, "agg", "follows", "count"]
  | [...UserDocumentPath, "agg", "follows", "data"]
  | [...UserDocumentPath, "agg", "follows", "data", string]
  | [...UserDocumentPath, "agg", "reports", "count"]
  | [...UserDocumentPath, "agg", "reports", "data"]
  | [...UserDocumentPath, "agg", "reports", "data", string];
export type UserAggWritePath =
  | [...UserDocumentPath, "agg", "connects"]
  | [...UserDocumentPath, "agg", "follows"]
  | [...UserDocumentPath, "agg", "reports"]
  | [...UserDocumentPath, "agg", "connects", "data", string, "r"]
  | [...UserDocumentPath, "agg", "follows", "data", string, "r"];
export type UserAggQueryPath =
  | [...UserDocumentPath, "agg", "my_memberships", "data"]
  | [...UserDocumentPath, "agg", "my_follows", "data"]
  | [...UserDocumentPath, "agg", "my_connects", "data"]
  | [...UserDocumentPath, "agg", "my_kudos", "data"]
  | [...UserDocumentPath, "agg", "my_submissions", "data"]
  | [...UserDocumentPath, "agg", "my_likes", "data"]
  | [...UserDocumentPath, "agg", "my_dislikes", "data"]
  | [...UserDocumentPath, "agg", "my_reports", "data"]
  | [...UserDocumentPath, "agg", "connects", "data"]
  | [...UserDocumentPath, "agg", "follows", "data"]
  | [...UserDocumentPath, "agg", "reports", "data"];

export type UserNotificationsReadPath =
  | [...UserDocumentPath, "notifications", "count"]
  | [...UserDocumentPath, "notifications", "data"]
  | [...UserDocumentPath, "notifications", "data", string];
export type UserNotificationsWritePath =
  | [...UserDocumentPath, "notifications", "data", string, "r"];
export type UserNotificationsQueryPath =
  | [...UserDocumentPath, "notifications", "data"];

export type UserChatReadPath =
  | [...UserDocumentPath, "chats", string]
  | [...UserDocumentPath, "chats", string, "a"]
  | [...UserDocumentPath, "chats", string, "data", string];
export type UserChatWritePath =
  | [...UserDocumentPath, "chats", string]
  | [...UserDocumentPath, "chats", string, "data", string];
export type UserChatQueryPath = [...UserDocumentPath, "chats", string, "data"];

export type PublishedPageAggReadPath =
  | [...PublishedPageDocumentPath, "agg", "score"]
  | [...PublishedPageDocumentPath, "agg", "rating"]
  | [...PublishedPageDocumentPath, "agg", "rank"]
  | [...PublishedPageDocumentPath, "agg", "likes", "count"]
  | [...PublishedPageDocumentPath, "agg", "likes", "data", string]
  | [...PublishedPageDocumentPath, "agg", "dislikes", "count"]
  | [...PublishedPageDocumentPath, "agg", "dislikes", "data", string]
  | [...PublishedPageDocumentPath, "agg", "kudos", "count"]
  | [...PublishedPageDocumentPath, "agg", "kudos", "data", string]
  | [...PublishedPageDocumentPath, "agg", "reports", "count"]
  | [...PublishedPageDocumentPath, "agg", "reports", "data", string];
export type PublishedPageAggWritePath =
  | [...PublishedPageDocumentPath, "agg", "likes"]
  | [...PublishedPageDocumentPath, "agg", "dislikes"]
  | [...PublishedPageDocumentPath, "agg", "kudos"]
  | [...PublishedPageDocumentPath, "agg", "reports"];
export type PublishedPageAggQueryPath =
  | [...PublishedPageDocumentPath, "agg", "likes", "data"]
  | [...PublishedPageDocumentPath, "agg", "dislikes", "data"]
  | [...PublishedPageDocumentPath, "agg", "kudos", "data"]
  | [...PublishedPageDocumentPath, "agg", "reports", "data"];

export type PublishedPageCommentAggReadPath =
  | [...PublishedPageCommentDocumentPath, "agg", "score"]
  | [...PublishedPageCommentDocumentPath, "agg", "rating"]
  | [...PublishedPageCommentDocumentPath, "agg", "rank"]
  | [...PublishedPageCommentDocumentPath, "agg", "likes", "count"]
  | [...PublishedPageCommentDocumentPath, "agg", "likes", "data", string]
  | [...PublishedPageCommentDocumentPath, "agg", "dislikes", "count"]
  | [...PublishedPageCommentDocumentPath, "agg", "dislikes", "data", string]
  | [...PublishedPageCommentDocumentPath, "agg", "reports", "count"]
  | [...PublishedPageCommentDocumentPath, "agg", "reports", "data", string];
export type PublishedPageCommentAggWritePath =
  | [...PublishedPageCommentDocumentPath, "agg", "likes"]
  | [...PublishedPageCommentDocumentPath, "agg", "dislikes"]
  | [...PublishedPageCommentDocumentPath, "agg", "reports"];
export type PublishedPageCommentAggQueryPath =
  | [...PublishedPageCommentDocumentPath, "agg", "likes", "data"]
  | [...PublishedPageCommentDocumentPath, "agg", "dislikes", "data"]
  | [...PublishedPageCommentDocumentPath, "agg", "reports", "data"];

export type PitchedProjectAggReadPath =
  | [...PitchedProjectDocumentPath, "agg", "score"]
  | [...PitchedProjectDocumentPath, "agg", "rating"]
  | [...PitchedProjectDocumentPath, "agg", "rank"]
  | [...PitchedProjectDocumentPath, "agg", "likes", "count"]
  | [...PitchedProjectDocumentPath, "agg", "likes", "data", string]
  | [...PitchedProjectDocumentPath, "agg", "dislikes", "count"]
  | [...PitchedProjectDocumentPath, "agg", "dislikes", "data", string]
  | [...PitchedProjectDocumentPath, "agg", "kudos", "count"]
  | [...PitchedProjectDocumentPath, "agg", "kudos", "data", string]
  | [...PitchedProjectDocumentPath, "agg", "reports", "count"]
  | [...PitchedProjectDocumentPath, "agg", "reports", "data", string];
export type PitchedProjectAggWritePath =
  | [...PitchedProjectDocumentPath, "agg", "likes"]
  | [...PitchedProjectDocumentPath, "agg", "dislikes"]
  | [...PitchedProjectDocumentPath, "agg", "kudos"]
  | [...PitchedProjectDocumentPath, "agg", "reports"];
export type PitchedProjectAggQueryPath =
  | [...PitchedProjectDocumentPath, "agg", "likes", "data"]
  | [...PitchedProjectDocumentPath, "agg", "dislikes", "data"]
  | [...PitchedProjectDocumentPath, "agg", "kudos", "data"]
  | [...PitchedProjectDocumentPath, "agg", "reports", "data"];

export type PitchedProjectContributionAggReadPath =
  | [...PitchedProjectContributionDocumentPath, "agg", "score"]
  | [...PitchedProjectContributionDocumentPath, "agg", "rating"]
  | [...PitchedProjectContributionDocumentPath, "agg", "rank"]
  | [...PitchedProjectContributionDocumentPath, "agg", "likes", "count"]
  | [...PitchedProjectContributionDocumentPath, "agg", "likes", "data", string]
  | [...PitchedProjectContributionDocumentPath, "agg", "dislikes", "count"]
  | [
      ...PitchedProjectContributionDocumentPath,
      "agg",
      "dislikes",
      "data",
      string
    ]
  | [...PitchedProjectDocumentPath, "agg", "kudos", "count"]
  | [...PitchedProjectDocumentPath, "agg", "kudos", "data", string]
  | [...PitchedProjectDocumentPath, "agg", "reports", "count"]
  | [...PitchedProjectDocumentPath, "agg", "reports", "data", string];
export type PitchedProjectContributionAggWritePath =
  | [...PitchedProjectContributionDocumentPath, "agg", "likes"]
  | [...PitchedProjectContributionDocumentPath, "agg", "dislikes"]
  | [...PitchedProjectContributionDocumentPath, "agg", "kudos"]
  | [...PitchedProjectContributionDocumentPath, "agg", "reports"];
export type PitchedProjectContributionAggQueryPath =
  | [...PitchedProjectContributionDocumentPath, "agg", "likes", "data"]
  | [...PitchedProjectContributionDocumentPath, "agg", "dislikes", "data"]
  | [...PitchedProjectContributionDocumentPath, "agg", "kudos", "data"]
  | [...PitchedProjectContributionDocumentPath, "agg", "reports", "data"];

export type PageDocReadPath = [...PageDocumentPath, "doc"];

export type PageAggReadPath =
  | [...PageDocumentPath, "agg", "follows", "count"]
  | [...PageDocumentPath, "agg", "follows", "data", string]
  | [...PageDocumentPath, "agg", "reports", "count"]
  | [...PageDocumentPath, "agg", "reports", "data", string];
export type PageAggWritePath =
  | [...PageDocumentPath, "agg", "follows"]
  | [...PageDocumentPath, "agg", "reports"];
export type PageAggQueryPath =
  | [...PageDocumentPath, "agg", "follows", "data"]
  | [...PageDocumentPath, "agg", "reports", "data"];

export type PageMembersReadPath = [...PageDocumentPath, "members"];
export type PageMemberReadPath = [
  ...PageDocumentPath,
  "members",
  "data",
  string
];
export type PageMemberWritePath = PageMemberReadPath;
export type PageMemberQueryPath = [...PageDocumentPath, "members", "data"];

export type ProjectInstancesReadPath =
  | [...ProjectDocumentPath, "instances"]
  | [...ProjectDocumentPath, "instances", "files"]
  | [...ProjectDocumentPath, "instances", "folders"]
  | [...ProjectDocumentPath, "instances", "configs"]
  | [...ProjectDocumentPath, "instances", "constructs"]
  | [...ProjectDocumentPath, "instances", "blocks"];
export type ProjectInstanceReadPath =
  | [...ProjectDocumentPath, "instances", "files", "data", string]
  | [...ProjectDocumentPath, "instances", "folders", "data", string]
  | [...ProjectDocumentPath, "instances", "configs", "data", string]
  | [...ProjectDocumentPath, "instances", "constructs", "data", string]
  | [...ProjectDocumentPath, "instances", "blocks", "data", string];
export type ProjectInstanceWritePath = ProjectInstanceReadPath;
export type ProjectInstanceQueryPath =
  | [...ProjectDocumentPath, "instances", "files", "data"]
  | [...ProjectDocumentPath, "instances", "folders", "data"]
  | [...ProjectDocumentPath, "instances", "configs", "data"]
  | [...ProjectDocumentPath, "instances", "constructs", "data"]
  | [...ProjectDocumentPath, "instances", "blocks", "data"];

export type InteractiveAggWritePath =
  | [...InteractiveDocumentPath, "agg", ActivityType];

export type AggWritePath =
  | ExportWritePath
  | TagAggWritePath
  | PageAggWritePath
  | UserAggWritePath
  | PhraseAggWritePath
  | PublishedPageAggWritePath
  | PitchedProjectAggWritePath
  | InteractiveAggWritePath;

export type DataStateReadPath =
  | ExportReadPath
  | InfoReadPath
  | UserAggReadPath
  | UserNotificationsReadPath
  | TagAggReadPath
  | PageAggReadPath
  | PageDocReadPath
  | UserChatReadPath
  | PhraseAggReadPath
  | PageMembersReadPath
  | PageMemberReadPath
  | ProjectInstancesReadPath
  | ProjectInstanceReadPath
  | PublishedPageAggReadPath
  | ProjectInstanceQueryPath
  | PitchedProjectAggReadPath
  | PublishedPageCommentAggReadPath
  | PitchedProjectContributionAggReadPath;

export type DataStateWritePath =
  | MessageWritePath
  | ExportWritePath
  | TagAggWritePath
  | PageAggWritePath
  | UserAggWritePath
  | UserNotificationsWritePath
  | UserChatWritePath
  | PhraseAggWritePath
  | PageMemberWritePath
  | ProjectInstanceWritePath
  | PublishedPageAggWritePath
  | PitchedProjectAggWritePath
  | PublishedPageCommentAggWritePath
  | PitchedProjectContributionAggWritePath
  | InteractiveAggWritePath
  | ProjectDocumentPath;

export type DataStateQueryPath =
  | TagAggQueryPath
  | PageAggQueryPath
  | UserAggQueryPath
  | UserNotificationsQueryPath
  | UserChatQueryPath
  | PageMemberQueryPath
  | PublishedPageAggQueryPath
  | PitchedProjectAggQueryPath
  | ProjectInstanceQueryPath
  | ProjectInstanceQueryPath
  | PublishedPageCommentAggQueryPath
  | PitchedProjectContributionAggQueryPath;

export type DataStatePath =
  | DataStateReadPath
  | DataStateWritePath
  | DataStateQueryPath;
