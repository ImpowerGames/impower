import { compile, format } from "../../../../spark-evaluate";
import {
  parseSpark,
  SparkDeclarations,
  SparkParserConfig,
  SparkParseResult,
} from "../../../../sparkdown";

export class SparkParser {
  private static _instance: SparkParser;

  public static get instance(): SparkParser {
    if (!this._instance) {
      this._instance = new SparkParser();
    }
    return this._instance;
  }

  defaults: string[] = [];

  config: SparkParserConfig = {
    compiler: compile,
    formatter: format,
    lineOffset: 1,
  };

  private _defaultAugmentations: SparkDeclarations = {};

  constructor(defaults?: string[], config?: SparkParserConfig) {
    this.defaults = defaults || this.defaults;
    this.config = config || this.config;
    this.defaults.forEach((d) => {
      const parsed = parseSpark(d, this.config);
      this._defaultAugmentations = {
        variables: {
          ...(this._defaultAugmentations?.variables || {}),
          ...(parsed.variables || {}),
        },
        structs: {
          ...(this._defaultAugmentations?.structs || {}),
          ...(parsed.structs || {}),
        },
      };
    });
  }

  parse(script: string, config?: SparkParserConfig): SparkParseResult {
    const augmentations = {
      variables: {
        ...(this._defaultAugmentations?.variables || {}),
        ...(config?.augmentations?.variables || {}),
      },
    };
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
      augmentations,
    });
    result.structs = {
      ...(this._defaultAugmentations?.structs || {}),
      ...(result.structs || {}),
    };
    return result;
  }
}
