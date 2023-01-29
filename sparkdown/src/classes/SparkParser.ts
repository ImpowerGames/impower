import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkParseResult } from "../types/SparkParseResult";
import { parseSpark } from "../utils/parseSpark";

export class SparkParser {
  config: SparkParserConfig = {};

  constructor(config: SparkParserConfig) {
    this.config = config || this.config;
  }

  parse(script: string, config?: SparkParserConfig): SparkParseResult {
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
    });
    return result;
  }
}
