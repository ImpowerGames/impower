import { SparkSectionToken, SparkToken } from "../../../sparkdown";
import { LineItem } from "../classes/Liner";
import { PrintProfile } from "./PrintProfile";
import { SparkScreenplayConfig } from "./SparkScreenplayConfig";

export interface PdfData {
  titleTokens: Record<string, SparkToken[]>;
  lines: LineItem[];
  print: PrintProfile;
  fonts: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  };
  sceneInvisibleSections: Record<string | number, SparkSectionToken[]>;
  config?: SparkScreenplayConfig;
}
