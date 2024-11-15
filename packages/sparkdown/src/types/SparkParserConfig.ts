export interface SparkParserConfig {
  builtinDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  optionalDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  schemaDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  files?: {
    [type: string]: {
      [name: string]: {
        ext: string;
        src: string;
        text?: string;
      };
    };
  };
  readFile?: (path: string) => string;
  resolveFile?: (uri: string) => string;
}
