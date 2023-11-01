import { DocumentSource } from "./DocumentSource";

export interface Block {
  source?: DocumentSource;
  indent: number;
  index: number;
  level: number;
  name: string;
  parent?: string;
  children?: string[];
  variables?: Record<
    string,
    { name: string; type: string; value: string; parameter?: boolean }
  >;
  commands?: Record<
    string,
    {
      reference: {
        type: "Command";
        id: string;
        typeId: string;
        parentId?: string;
      };
      source: {
        file: string;
        line: number;
        from: number;
        to: number;
      };
      indent: number;
      params: {
        check?: string;
        waitUntilFinished: boolean;
        assets?: string[];
      };
    }
  >;
}
