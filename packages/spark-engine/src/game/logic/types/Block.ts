import { DocumentSource } from "./DocumentSource";

export interface Block {
  source?: DocumentSource;
  level: number;
  name: string;
  parent?: string;
  children?: string[];
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
        waitUntilFinished?: boolean;
      };
    }
  >;
}
