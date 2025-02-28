import { File } from "./File";

export interface SparkdownCompilerConfig {
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
  descriptionDefinitions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  files?: File[];
}
