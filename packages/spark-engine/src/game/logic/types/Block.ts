import { DocumentSource } from "./DocumentSource";

export interface Block {
  source?: DocumentSource;
  indent: number;
  index: number;
  level: number;
  type: "section" | "function" | "method" | "detector";
  name: string;
  parent?: string;
  children?: string[];
  triggers?: string[];
  variables?: Record<
    string,
    { name: string; type: string; value: unknown; parameter?: boolean }
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
