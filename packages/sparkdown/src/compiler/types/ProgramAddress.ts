export type ProgramAddress = number;

export const TOP_LEVEL_START: ProgramAddress = -1;

export interface SourceLocation {
  uri: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface AddressQuery {
  beat?: "first" | "last";
  functions?: boolean;
}

export interface ProgramLocator {
  addressAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): ProgramAddress | undefined;
  locationOf(address: ProgramAddress | null | undefined): SourceLocation | undefined;
  sceneAt(address: ProgramAddress | null | undefined): string | undefined;
}

export interface LineBeat {
  address: ProgramAddress;
  location?: SourceLocation;
}

export interface AsyncProgramLocator {
  addressAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): Promise<ProgramAddress | undefined>;
  locationOf(address: ProgramAddress): Promise<SourceLocation | undefined>;
  beatAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): Promise<LineBeat | undefined>;
}
