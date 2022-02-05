export class StringBuilder {
  private string: string;

  constructor(str?: string) {
    str = typeof str !== "undefined" ? str.toString() : "";
    this.string = str;
  }

  get Length(): number {
    return this.string.length;
  }

  public Append(str: string): void {
    if (str !== null) {
      this.string += str;
    }
  }

  public AppendLine(str?: string): void {
    if (typeof str !== "undefined") this.Append(str);
    this.string += "\n";
  }

  public AppendFormat(format: string, ...args: any[]): void {
    // taken from http://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
    this.string += format.replace(/{(\d+)}/g, (match: string, num: number) =>
      typeof args[num] !== "undefined" ? args[num] : match
    );
  }

  public ToString(): string {
    return this.string;
  }
}
