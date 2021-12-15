export interface FlaggableDocument {
  deleted?: boolean;
  nsfw?: boolean;

  readonly muted?: boolean;
  readonly suspended?: boolean;
  readonly banned?: boolean;
  readonly removed?: boolean;

  readonly delisted?: boolean;

  readonly nsfwWords?: { [field: string]: string[] };
  readonly flagged?: string[];
}
