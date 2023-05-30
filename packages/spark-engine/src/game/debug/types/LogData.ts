export interface LogData {
  id: string;
  parentBlockId: string;
  blockId: string;
  commandId: string;
  time: number;
  severity: "Info" | "Warning" | "Error";
  message: string;
}
