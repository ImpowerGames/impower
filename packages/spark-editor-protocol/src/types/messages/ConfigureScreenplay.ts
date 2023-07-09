import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type ConfigureScreenplayMethod = typeof ConfigureScreenplay.method;

export interface ConfigureScreenplayParams {
  textDocument: TextDocumentIdentifier;
  options: {
    scrollSynced?: boolean;
    theme?: string;
    texture?: boolean;
    paperProfile?: string;
    boldSceneHeaders?: boolean;
    printSections?: boolean;
    printSynopses?: boolean;
    printNotes?: boolean;
    printTitlePage?: boolean;
    printPageNumbers?: boolean;
    printSectionNumbers?: boolean;
    printSceneNumbers?: string;
    splitDialogueAcrossPages?: boolean;
    moreDialogueText?: string;
    continuedDialogueText?: string;
    headerText?: string;
    footerText?: string;
    watermarkText?: string;
  };
}

export interface ConfigureScreenplayMessage
  extends Message<ConfigureScreenplayMethod, ConfigureScreenplayParams> {}

export class ConfigureScreenplay {
  static readonly method = "screenplay/configure";
  static is(obj: any): obj is ConfigureScreenplayMessage {
    return obj.method === this.method;
  }
  static create(params: ConfigureScreenplayParams): ConfigureScreenplayMessage {
    return {
      method: this.method,
      params,
    };
  }
}
