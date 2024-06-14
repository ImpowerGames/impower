export interface SparkParserConfig {
  builtins?: {
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
