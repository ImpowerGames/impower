import { ScreenplayConfig } from "../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ExportHTMLMethod = typeof ExportHTMLMessage.method;

export interface ExportHTMLParams {
  scripts: string[];
  fonts: {
    normal: ArrayBuffer;
    bold: ArrayBuffer;
    italic: ArrayBuffer;
    bolditalic: ArrayBuffer;
    [name: string]: ArrayBuffer;
  };
  config?: ScreenplayConfig;
  workDoneToken?: string;
}

export class ExportHTMLMessage {
  static readonly method = "workspace/exportHTML";
  static readonly type = new MessageProtocolRequestType<
    ExportHTMLMethod,
    ExportHTMLParams,
    string
  >(ExportHTMLMessage.method);
}
