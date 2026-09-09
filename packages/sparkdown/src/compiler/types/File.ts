import type { AttributeVocabulary } from "../../attributes/types";

export interface File {
  uri: string;
  type: string;
  name: string;
  ext: string;
  src?: string;
  text?: string;
  data?: string;
  attribute_vocabulary?: AttributeVocabulary;
  version?: number | null;
  languageId?: string | null;
}
