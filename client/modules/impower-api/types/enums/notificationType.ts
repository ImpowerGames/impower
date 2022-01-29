import { ActivityType } from "./activityType";

export type NotificationType =
  | ActivityType
  | "banned"
  | "muted"
  | "suspended"
  | "flagged";
