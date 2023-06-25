import {
  languageClient,
  LanguageClient,
  LanguageClientOptions,
} from "../cm-languageclient";

const createSparkdownLanguageClient = (
  clientOptions?: LanguageClientOptions
) => {
  const worker = new Worker("/public/sparkdown-language-server.js");
  return new LanguageClient(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    {
      documentSelector: [{ language: "sparkdown" }],
      ...(clientOptions || {}),
    },
    worker
  );
};

const sparkdownLanguageClient = (documentUri: string) => {
  const client = createSparkdownLanguageClient();
  return [languageClient(client, documentUri)];
};

export default sparkdownLanguageClient;
