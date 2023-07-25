export interface FileSystemReader {
  scheme: string;
  read: (uri: string) => Promise<ArrayBuffer>;
}
