import { SparkScreenplayConfig } from "../../../../sparkdown-screenplay/src/types/SparkScreenplayConfig";
import { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ExportPDFMethod = typeof ExportPDFMessage.method;

export interface ExportPDFParams {
  programs: SparkProgram[];
  fonts: {
    normal: ArrayBuffer;
    bold: ArrayBuffer;
    italic: ArrayBuffer;
    bolditalic: ArrayBuffer;
  };
  config?: SparkScreenplayConfig;
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
