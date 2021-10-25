import { DataDocument, StorageFile } from "../../../impower-core";

export interface UserDocument extends DataDocument<"UserDocument"> {
  username: string;
  bio: string;
  icon: StorageFile;
  hex: string;

  readonly admin?: boolean;
  readonly terms?: string[];
}
