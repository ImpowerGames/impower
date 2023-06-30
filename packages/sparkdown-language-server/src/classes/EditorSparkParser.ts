import { compile, format } from "@impower/spark-evaluate/src/index";
import { SparkParser } from "@impower/sparkdown/src/classes/SparkParser";
import { SparkParserConfig } from "@impower/sparkdown/src/types/SparkParserConfig";

export class EditorSparkParser extends SparkParser {
  private static _instance: EditorSparkParser;

  public static get instance(): EditorSparkParser {
    if (!this._instance) {
      this._instance = new EditorSparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig) {
    super(
      config || {
        compiler: compile,
        formatter: format,
      }
    );
  }
}
