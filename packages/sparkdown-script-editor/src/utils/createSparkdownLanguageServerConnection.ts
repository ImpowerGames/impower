import {
  LanguageClientOptions,
  LanguageServerConnection,
} from "../cm-languageclient";

export const createSparkdownLanguageServerConnection = (
  clientOptions?: LanguageClientOptions
) => {
  const worker = new Worker("/public/sparkdown-language-server.js");
  return new LanguageServerConnection(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    {
      documentSelector: [{ language: "sparkdown" }],
      ...(clientOptions || {}),
    },
    worker
  );
};
