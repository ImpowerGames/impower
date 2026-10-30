import { lookupStdLibBuiltin } from "../../../runtime/StdLib";

export function mapStdLibCallToBuiltin(
  receiverName: string,
  methodName: string,
  argCount: number,
): string | null {
  return lookupStdLibBuiltin(receiverName, methodName, argCount);
}
