export interface FileData {
  uri: string;
  name: string;
  src: string;
  ext: string;
  type: string;
  version: number;
  size?: number;
  modified?: number;
  text?: string;
  languageId?: string | null;
}
