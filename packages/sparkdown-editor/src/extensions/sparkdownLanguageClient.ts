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

const sparkdownLanguageClient = () => {
  const client = createSparkdownLanguageClient();
  return [languageClient(client)];
};

export default sparkdownLanguageClient;
