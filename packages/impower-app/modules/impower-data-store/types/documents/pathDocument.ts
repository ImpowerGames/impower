import { DataDocument } from "../../../impower-core";

export interface PathDocument extends DataDocument<"PathDocument"> {
  path: string;
}
