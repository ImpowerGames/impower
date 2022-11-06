import { EngineSparkParser } from "../../../../spark-engine";
import { generateSparkCsvData } from "../../../../spark-screenplay";
import { downloadFile } from "./downloadFile";

export const exportCsv = async (
  name: string,
  script: string
): Promise<void> => {
  const { stringify } = await import("csv-stringify");
  const result = EngineSparkParser.instance.parse(script, {
    removeBlockComments: true,
    skipTokens: ["condition"],
  });
  const strings = generateSparkCsvData(result);
  const csv = await new Promise<string>((resolve) => {
    stringify(strings, {}, async (_err: Error | undefined, output: string) => {
      resolve(output);
    });
  });
  downloadFile(`${name}.csv`, "text/csv", csv);
};
