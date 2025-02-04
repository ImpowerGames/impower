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
  };
  config?: ScreenplayConfig;
  workDoneToken?: string;
}

export class ExportPDFMessage {
  static readonly method = "workspace/exportPDF";
  static readonly type = new MessageProtocolRequestType<
    ExportPDFMethod,
    ExportPDFParams,
    ArrayBuffer
  >(ExportPDFMessage.method);
}
