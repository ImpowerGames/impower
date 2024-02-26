import { DocumentLine } from "../classes/Typesetter";
import { PrintProfile } from "./PrintProfile";
import { SparkScreenplayConfig } from "./SparkScreenplayConfig";

export interface PdfData {
  frontMatter: Record<string, string[]>;
  lines: DocumentLine[];
  print: PrintProfile;
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  };
  config?: SparkScreenplayConfig;
}
