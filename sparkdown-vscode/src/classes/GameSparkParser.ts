import { compile, format } from "../../../spark-evaluate";
import {
  defaultDisplayScript,
  parseSpark,
  SparkDeclarations,
  SparkParserConfig,
  SparkParseResult,
} from "../../../sparkdown";

export class GameSparkParser {
  private static _instance: GameSparkParser;

  public static get instance(): GameSparkParser {
    if (!this._instance) {
      this._instance = new GameSparkParser();
    }
    return this._instance;
  }

  defaults: string[] = [defaultDisplayScript];

  config: SparkParserConfig = {
    compiler: compile,
    formatter: format,
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
      structs: {
        ...(this._defaultAugmentations?.structs || {}),
        ...(config?.augmentations?.structs || {}),
      },
    };
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
      augmentations,
    });
    return result;
  }
}
