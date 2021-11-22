import { DataDocument, StorageFile } from "../../../impower-core";
import { FlaggableDocument } from "./flaggableDocument";

export interface UserDocument
  extends DataDocument<"UserDocument">,
    FlaggableDocument {
  username: string;
  bio: string;
  icon: StorageFile;
  hex: string;

  readonly admin?: boolean;
  readonly terms?: string[];
}
