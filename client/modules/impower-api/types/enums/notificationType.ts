import { ActivityType } from "./activityType";

export type NotificationType =
  | ActivityType
  | "banned"
  | "unbanned"
  | "muted"
  | "unmuted"
  | "suspended"
  | "unsuspended"
  | "flagged"
  | "unflagged";
