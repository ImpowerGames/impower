import LanguageClient from "../classes/LanguageClient";
import languageClientPlugin from "../plugins/languageClientPlugin";

const languageClientExtension = (client: LanguageClient) => {
  return [languageClientPlugin(client)];
};

export default languageClientExtension;
