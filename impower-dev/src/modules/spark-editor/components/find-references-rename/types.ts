export type UsageLocation = {
  uri: string;
  label: string;
  line: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};
