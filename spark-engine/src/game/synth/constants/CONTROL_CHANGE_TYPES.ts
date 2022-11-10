import { ControlChangeType } from "../types/ControlChangeType";

interface ControlChangeMap {
  [key: number]: ControlChangeType;
}

export const CONTROL_CHANGE_TYPES: ControlChangeMap = {
  1: "modulationWheel",
  2: "breath",
  4: "footController",
  5: "portamentoTime",
  7: "volume",
  8: "balance",
  10: "pan",
  64: "sustain",
  65: "portamentoTime",
  66: "sostenuto",
  67: "softPedal",
  68: "legatoFootswitch",
  84: "portamentoControl",
};
