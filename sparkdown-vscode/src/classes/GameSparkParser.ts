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

  constructor(defaults?: string[], config?: SparkParserConfig) {
    this.defaults = defaults || this.defaults;
    this.config = config || this.config;
  }

  parse(script: string, config?: SparkParserConfig): SparkParseResult {
    let augmentations: SparkDeclarations = {
      ...(this.config?.augmentations || {}),
      ...(config?.augmentations || {}),
    };
    this.defaults.forEach((d) => {
      const parsed = parseSpark(d, {
        ...(this.config || {}),
        ...(config || {}),
        augmentations,
      });
      augmentations = {
        ...augmentations,
        variables: {
          ...(augmentations?.variables || {}),
          ...(parsed.variables || {}),
        },
        structs: {
          ...(augmentations?.structs || {}),
          ...(parsed.structs || {}),
        },
      };
    });
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
      augmentations,
    });
    return result;
  }
}
