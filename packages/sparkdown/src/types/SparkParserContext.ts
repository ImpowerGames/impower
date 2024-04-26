import { SparkRange } from "./SparkRange";

export interface SparkParserContext extends SparkRange {
  scopes: { type: string; data: Record<string, unknown> }[];
  text: string;
  declarations: {
    variables?: Record<
      string,
      {
        from: number;
        to: number;
        line: number;
        name: string;
        type: string;
        value: unknown;
        parameter?: boolean;
        scope?: "public" | "protected" | "private";
      }
    >;
    structs?: Record<
      string,
      {
        from: number;
        to: number;
        line: number;
        name: string;
        base: string;
        type: string;
        fields: Record<
          string,
          {
            from: number;
            to: number;
            line: number;
            name: string;
            type: string;
            valueText: string;
            value: unknown;
            struct?: string;
          }
        >;
      }
    >;
  };
}
