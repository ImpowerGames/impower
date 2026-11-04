export interface FileCommit {
  sequence: number;
  writer: string;
}

export type FileCommits = Record<string, FileCommit>;
