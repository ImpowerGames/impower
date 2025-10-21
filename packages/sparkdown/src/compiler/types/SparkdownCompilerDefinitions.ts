export interface SparkdownCompilerDefinitions {
  builtins?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  optionals?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  schemas?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  descriptions?: {
    [type: string]: {
      [name: string]: any;
    };
  };
}
