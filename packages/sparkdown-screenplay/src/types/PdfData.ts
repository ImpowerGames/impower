import { DocumentSpan } from "./DocumentSpan";
import { PrintProfile } from "./PrintProfile";
import { SparkScreenplayConfig } from "./SparkScreenplayConfig";

export interface PdfData {
  info: {
    title: string;
    author: string;
  };
  frontMatterSpans: Record<string, DocumentSpan>;
  bodySpans: DocumentSpan[];
  print: PrintProfile;
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  };
  config?: SparkScreenplayConfig;
}
