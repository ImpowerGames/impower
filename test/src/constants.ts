export type SubmissionType =
  | "studios"
  | "games"
  | "resources"
  | "phrases"
  | "contributions"
  | "comments"
  | "reports"
  | "suggestions";

export type CustomizationType = "phrase_additions" | "phrase_deletions";

export type SettingsType = "account";

export type AggregationType =
  | "follows"
  | "connects"
  | "kudos"
  | "likes"
  | "dislikes"
  | "my_submissions"
  | "my_memberships"
  | "my_follows"
  | "my_connects"
  | "my_kudos"
  | "my_likes"
  | "my_dislikes"
  | "studios"
  | "resources"
  | "games"
  | "members"
  | "suggestions"
  | "comments"
  | "contributions";

export type MemberAccess = "viewer" | "editor" | "owner";

export type AuthClaims = {
  uid: string;
  username: string;
  icon: string;
  hex: string;
  email: string;
  iat: number;
  captcha_time?: number;
  admin?: boolean;
};

export type AuthorAttributes = {
  u: string;
  i: string;
  h: string;
};

export const PROJECT_ID = "impowergames-dev";
export const DATABASE_NAME = "impowergames-dev";
export const STORAGE_BUCKET = "impowergames-dev";

export const THEIR_ID = "user_xyz";
export const THEIR_EMAIL = "xyz@gmail.com";
export const THEIR_USERNAME = "xavier";
export const THEIR_AVATAR = "https://images.com/dog.png";
export const THEIR_HEX = "#FFFFFF";
export const THEIR_STUDIO_ID = "their_studio";
export const THEIR_STUDIO_HANDLE = "theirstudiohandle";
export const THEIR_RESOURCE_ID = "their_resource";
export const THEIR_RESOURCE_SLUG = "their_resource_name";
export const THEIR_GAME_ID = "their_game";
export const THEIR_GAME_SLUG = "their_game_name";

export const THEIR_VALID_AUTH = {
  uid: THEIR_ID,
  email: THEIR_EMAIL,
  username: THEIR_USERNAME,
  icon: THEIR_AVATAR,
  hex: THEIR_HEX,
  iat: 1000000000000,
  auth_time: 1000000000000,
  captcha_time: 2000000000000,
  dob: new Date(1994, 4, 4).toJSON(),
};

export const MY_ID = "O0hAxVxGPTRDz77GC4CLwu16TmT2";
export const MY_EMAIL = "abc@gmail.com";
export const MY_USERNAME = "amelia";
export const MY_AVATAR = "https://images.com/cat.png";
export const MY_HEX = "#FFFFFF";
export const MY_STUDIO_ID = "my_studio";
export const MY_STUDIO_HANDLE = "mystudiohandle";
export const MY_RESOURCE_ID = "my_resource";
export const MY_RESOURCE_SLUG = "my_resource_name";
export const MY_GAME_ID = "my_game";
export const MY_GAME_SLUG = "my_game_name";
export const MY_PROJECT_ID = "my_project";

export const FILE_ID = "000";
export const CHILD_ID = "my_project_child";

export const MY_EXPIRED_AUTH = {
  uid: MY_ID,
  email: MY_EMAIL,
  username: MY_USERNAME,
  icon: MY_AVATAR,
  hex: MY_HEX,
  iat: 1000000000000,
  auth_time: 2000000000000,
  captcha_time: 1000000000000,
  dob: new Date(1994, 4, 4).toJSON(),
};

export const MY_VALID_AUTH = {
  uid: MY_ID,
  email: MY_EMAIL,
  username: MY_USERNAME,
  icon: MY_AVATAR,
  hex: MY_HEX,
  iat: 1000000000000,
  auth_time: 1000000000000,
  captcha_time: 1000000000000,
  dob: new Date(1994, 4, 4).toJSON(),
};

export const submissionTypes: SubmissionType[] = [
  "studios",
  "resources",
  "games",
  "contributions",
  "comments",
  "reports",
  "phrases",
  "suggestions",
];
export const customizationTypes: CustomizationType[] = [
  "phrase_additions",
  "phrase_deletions",
];
export const settingTypes: SettingsType[] = ["account"];

export const invalidUsernames = [
  "",
  "this_username_is_over_15_characters_long",
  "u1_~!@#$%^&*()_+",
  false,
  123,
  null,
];
