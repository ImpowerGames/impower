import {
  LanguageClientOptions,
  LanguageServerConnection,
} from "../cm-languageclient";

export const createSparkdownLanguageServerConnection = (
  serverWorker: Worker,
  clientOptions?: LanguageClientOptions
) => {
  return new LanguageServerConnection(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    {
      documentSelector: [{ language: "sparkdown" }],
      ...(clientOptions || {}),
    },
    serverWorker
  );
};
