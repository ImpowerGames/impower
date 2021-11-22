import { DataDocument } from "../../../impower-core";

export interface NoteDocument extends DataDocument<"NoteDocument"> {
  content: string;

  readonly delisted?: boolean;
  readonly removed?: boolean;
  readonly banned?: boolean;

  readonly mentions?: string[];
}
