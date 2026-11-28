export type TextWriteReason = "line write";

export type TextClearReason =
  | "line clear"
  | "line replace"
  | "choose"
  | "leave choices"
  | "rollback cleanup"
  | "connect reset"
  | "unwritten slot"
  | "redisplay";

export type TextReason = TextWriteReason | TextClearReason;

export interface TextReasonRule {
  deletesSavedText: boolean;
  recordsStamp: boolean;
  opensLine: boolean;
  reach: "marked" | "unmarked" | "name" | "line";
}

export const TEXT_REASONS: Readonly<Record<TextReason, Readonly<TextReasonRule>>> = {
  "line write": { deletesSavedText: false, recordsStamp: true, opensLine: false, reach: "name" },
  "line clear": { deletesSavedText: true, recordsStamp: true, opensLine: true, reach: "marked" },
  "line replace": { deletesSavedText: true, recordsStamp: false, opensLine: false, reach: "line" },
  choose: { deletesSavedText: true, recordsStamp: false, opensLine: false, reach: "name" },
  "leave choices": { deletesSavedText: true, recordsStamp: false, opensLine: false, reach: "name" },
  "rollback cleanup": { deletesSavedText: false, recordsStamp: false, opensLine: false, reach: "name" },
  "connect reset": { deletesSavedText: true, recordsStamp: true, opensLine: true, reach: "marked" },
  "unwritten slot": { deletesSavedText: false, recordsStamp: false, opensLine: false, reach: "unmarked" },
  redisplay: { deletesSavedText: true, recordsStamp: true, opensLine: false, reach: "marked" },
};
