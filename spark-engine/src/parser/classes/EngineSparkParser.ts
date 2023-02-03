import { compile, format } from "../../../../spark-evaluate";
import { SparkParser, SparkParserConfig } from "../../../../sparkdown";
import { processBeatmap } from "../../game/rhythm";

export class EngineSparkParser extends SparkParser {
  private static _instance: EngineSparkParser;

  public static get instance(): EngineSparkParser {
    if (!this._instance) {
      this._instance = new EngineSparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig) {
    super({
      compiler: compile,
      formatter: format,
      extensions: [processBeatmap],
      lineOffset: 1,
      ...(config || {}),
    });
  }
}
