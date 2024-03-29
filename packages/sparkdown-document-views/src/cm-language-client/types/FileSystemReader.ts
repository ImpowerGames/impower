export interface FileSystemReader {
  scheme: string;
  url: (uri: string) => string | undefined | Promise<string | undefined>;
}
