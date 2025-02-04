import { DocumentSpan } from "./DocumentSpan";
import { PrintProfile } from "./PrintProfile";
import { ScreenplayConfig } from "./ScreenplayConfig";

export interface PdfData {
  info: {
    title: string;
    author: string;
  };
  spans: DocumentSpan[];
  print: PrintProfile;
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  };
  config?: ScreenplayConfig;
}
