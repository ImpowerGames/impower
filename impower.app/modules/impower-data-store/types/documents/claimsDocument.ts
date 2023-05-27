import { UserClaims } from "../../../impower-auth";
import { DataDocument } from "../../../impower-core";

export interface ClaimsDocument
  extends DataDocument<"ClaimsDocument">,
    UserClaims {
  _documentType: "ClaimsDocument";
}
