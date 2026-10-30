import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";

export interface PreviewingGame {
  state: string;
  previewFrom: PreviewFrom | undefined;
  previewAddress: ProgramAddress | undefined;
  previewedAddress: ProgramAddress | undefined;
}

export interface PreviewFrom {
  file: string;
  line: number;
  address?: ProgramAddress;
}

export interface PreviewPoint {
  from: PreviewFrom;
  address: ProgramAddress | null | undefined;
  validAddress: ProgramAddress | null | undefined;
  repeat: boolean;
}

export function resolvePreviewPoint(
  program: SparkProgram,
  from: PreviewFrom,
  programChanged: boolean,
  game: PreviewingGame | undefined,
  relocate?: (from: PreviewFrom) => PreviewFrom,
): PreviewPoint {
  const locator = programLocator(program);
  const address =
    from.address ?? locator.addressAt(from.file, from.line, { beat: "last" });

  const remembered = (address != null ? from : game?.previewFrom) ?? from;
  const validFrom =
    address == null && programChanged && remembered.address != null
      ? (relocate?.(remembered) ?? { file: remembered.file, line: remembered.line })
      : remembered;
  const resolved =
    address != null
      ? address
      : programChanged
        ? (validFrom.address ??
          locator.addressAt(validFrom.file, validFrom.line, { beat: "last" }))
        : game?.previewAddress;
  const validAddress = resolved ?? game?.previewAddress;

  const repeat =
    game != null &&
    game.state === "previewing" &&
    validAddress != null &&
    game.previewedAddress === validAddress &&
    !programChanged;

  return { from: validFrom, address: resolved, validAddress, repeat };
}
