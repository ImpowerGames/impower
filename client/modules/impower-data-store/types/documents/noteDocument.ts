import { DataDocument } from "../../../impower-core";
import { FlaggableDocument } from "./flaggableDocument";

export interface NoteDocument
  extends DataDocument<"NoteDocument">,
    FlaggableDocument {
  content: string;

  readonly mentions?: string[];
}
