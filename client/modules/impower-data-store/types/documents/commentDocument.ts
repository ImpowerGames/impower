import { DataDocument } from "../../../impower-core";

export interface CommentDocument extends DataDocument<"CommentDocument"> {
  content: string;
  commented: boolean;

  score?: number;
  likes?: number;
  dislikes?: number;

  readonly rank?: number;
  readonly rating?: number;

  readonly delisted?: boolean;
  readonly removed?: boolean;

  readonly mentions?: string[];
}
