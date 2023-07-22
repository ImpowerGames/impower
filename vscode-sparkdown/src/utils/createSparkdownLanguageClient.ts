import { ExtensionContext, Uri, workspace } from "vscode";
import { LanguageClientOptions } from "vscode-languageclient";
import { LanguageClient } from "vscode-languageclient/browser";
import { SparkPackageManager } from "../providers/SparkPackageManager";

export const createSparkdownLanguageClient = async (
  context: ExtensionContext,
  clientOptions: LanguageClientOptions = {}
) => {
  const serverMain = Uri.joinPath(
    context.extensionUri,
    "out",
    "workers",
    "sparkdown-language-server.js"
  );
  const filePattern = "**/*.{sd,svg,png,midi,wav}";
  const packages = await SparkPackageManager.instance.getPackages(filePattern);
  const fileWatcher = workspace.createFileSystemWatcher(filePattern);
  const serverMainUrl = serverMain.toString(true);
  const worker = new Worker(serverMainUrl);
  return new LanguageClient(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    {
      documentSelector: [{ language: "sparkdown" }],
      ...clientOptions,
      synchronize: {
        fileEvents: fileWatcher,
        ...clientOptions.synchronize,
      },
      initializationOptions: {
        packages,
        ...clientOptions.initializationOptions,
      },
    },
    worker
  );
};
