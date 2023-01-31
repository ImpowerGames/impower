import { compile, format } from "../../../../spark-evaluate";
import {
  SparkParser,
  SparkParserConfig,
  SparkParseResult,
} from "../../../../sparkdown";

export class EngineSparkParser extends SparkParser {
  private static _instance: EngineSparkParser;

  public static get instance(): EngineSparkParser {
    if (!this._instance) {
      this._instance = new EngineSparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig) {
    super(
      config || {
        compiler: compile,
        formatter: format,
        lineOffset: 1,
      }
    );
  }

  override parse(script: string, config?: SparkParserConfig): SparkParseResult {
    return super.parse(script, config);
  }
}
