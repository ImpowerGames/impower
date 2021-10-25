import { DataDocument } from "../../../impower-core";

export interface CustomizationDocument
  extends DataDocument<"CustomizationDocument"> {
  phraseTags: { [phrase: string]: string[] };
}
