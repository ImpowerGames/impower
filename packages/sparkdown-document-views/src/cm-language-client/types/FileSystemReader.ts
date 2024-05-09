export interface FileSystemReader {
  scheme: string;
  url: (
    uri: string | undefined
  ) => string | undefined | Promise<string | undefined>;
}
