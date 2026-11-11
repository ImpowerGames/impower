import type {
  ImportFailureReason,
  ImportOutcome,
} from "@impower/spark-editor-protocol/src/types";

export class ProjectImportError extends Error {
  readonly reason: ImportFailureReason;

  constructor(
    failure: { reason: ImportFailureReason },
    options?: { cause?: unknown },
  ) {
    super(failure.reason, options);
    this.reason = failure.reason;
  }
}

const FAILURE_SENTENCES: Record<
  ImportFailureReason,
  (fileName: string) => string
> = {
  unreadable_zip: (fileName) =>
    `“${fileName}” is not a .zip this editor can open. Choose a backup made with Download .zip.`,
  storage: (fileName) =>
    `Could not save “${fileName}” on this device. Free some space and try again.`,
  unknown: (fileName) =>
    `Could not import “${fileName}”. Try again, or choose another backup.`,
};

export const importOutcomeSentence = (outcome: ImportOutcome): string | null =>
  FAILURE_SENTENCES[outcome.reason](outcome.fileName);
