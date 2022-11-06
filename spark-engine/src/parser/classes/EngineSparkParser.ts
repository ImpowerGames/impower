import { compile, format } from "../../../../spark-evaluate";
import { SparkParser, SparkParserConfig } from "../../../../sparkdown";

export class EngineSparkParser extends SparkParser {
  private static _instance: EngineSparkParser;

  public static get instance(): EngineSparkParser {
    if (!this._instance) {
      this._instance = new EngineSparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig, defaults?: string[]) {
    super(
      config || {
        compiler: compile,
        formatter: format,
        lineOffset: 1,
      },
      defaults
    );
  }
}
