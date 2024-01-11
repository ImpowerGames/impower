export interface Command {
  reference: {
    type: "Command";
    id: string;
    typeId: string;
    parentId: string;
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
