export interface FlaggableDocument {
  deleted?: boolean;

  readonly muted?: boolean;
  readonly suspended?: boolean;
  readonly banned?: boolean;
  readonly removed?: boolean;

  readonly delisted?: boolean;

  readonly nsfw?: boolean;
  readonly nsfwWords?: { [field: string]: string[] };
  readonly flagged?: string[];
}
