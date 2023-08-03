import { compile, format } from "../../../../spark-evaluate/src";
import { SparkParser, SparkParserConfig } from "../../../../sparkdown/src";
import { processBeatmap } from "../../game/rhythm";

export default class EngineSparkParser extends SparkParser {
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
      ...(config || {}),
    });
  }
}
