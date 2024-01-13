export interface Command {
  reference: {
    id: string;
    typeId: string;
    parentId: string;
    index: number;
  };
  source: {
    file: string;
    line: number;
    from: number;
    to: number;
  };
  indent: number;
  params: {
    check?: string;
    waitUntilFinished?: boolean;
  };
}
