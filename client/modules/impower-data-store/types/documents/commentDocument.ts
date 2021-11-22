import { DataDocument } from "../../../impower-core";
import { FlaggableDocument } from "./flaggableDocument";

export interface CommentDocument
  extends DataDocument<"CommentDocument">,
    FlaggableDocument {
  content: string;
  deleted: boolean;

  score?: number;
  likes?: number;
  dislikes?: number;

  readonly rank?: number;
  readonly rating?: number;

  readonly mentions?: string[];
}
