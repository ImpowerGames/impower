import { ScreenplayConfig } from "../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ExportPDFMethod = typeof ExportPDFMessage.method;

export interface ExportPDFParams {
  scripts: string[];
  fonts: {
    normal: ArrayBuffer;
    bold: ArrayBuffer;
    italic: ArrayBuffer;
    bolditalic: ArrayBuffer;
    [name: string]: ArrayBuffer;
  };
  fallbackFonts?: { normal: ArrayBuffer; bold?: ArrayBuffer }[];
  config?: ScreenplayConfig;
  workDoneToken?: string;
}

export interface ExportPDFResult {
  pdf: ArrayBuffer;
  unprintable: string[];
}

export class ExportPDFMessage {
  static readonly method = "workspace/exportPDF";
  static readonly type = new MessageProtocolRequestType<
    ExportPDFMethod,
    ExportPDFParams,
    ExportPDFResult
  >(ExportPDFMessage.method);
}
