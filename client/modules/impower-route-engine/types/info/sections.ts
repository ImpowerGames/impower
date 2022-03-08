import { ButtonInfo } from "../../../impower-route";
import { WindowType } from "../state/windowState";
import {
  accessSetupHeader,
  commandHeader,
  elementHeader,
  gameSetupHeader,
  HeaderInfo,
  HeaderType,
  previewHeader,
  projectSetupHeader,
  triggerHeader,
  variableHeader,
} from "./headers";

export interface SectionInfo extends ButtonInfo {
  type: HeaderType;
  name: string;
}

const getSectionInfo = (headerInfo: HeaderInfo): SectionInfo => {
  return {
    type: headerInfo.type,
    name: headerInfo.pluralName,
    iconOn: headerInfo.iconOn,
    iconOff: headerInfo.iconOff,
  };
};

export const editorSetupSections: SectionInfo[] = [
  getSectionInfo(projectSetupHeader),
];

export const ownerSetupSections: SectionInfo[] = [
  getSectionInfo(gameSetupHeader),
  getSectionInfo(projectSetupHeader),
  getSectionInfo(accessSetupHeader),
];

export const entitySections: SectionInfo[] = [
  getSectionInfo(previewHeader),
  getSectionInfo(elementHeader),
  getSectionInfo(variableHeader),
];

export const logicSections: SectionInfo[] = [
  getSectionInfo(triggerHeader),
  getSectionInfo(commandHeader),
  getSectionInfo(variableHeader),
];

export const getSections = (windowType: WindowType): SectionInfo[] => {
  switch (windowType) {
    case "Setup":
      return ownerSetupSections;
    case "Entities":
      return entitySections;
    case "Logic":
      return logicSections;
    default:
      return [];
  }
};
