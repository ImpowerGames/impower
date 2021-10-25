import { ButtonInfo } from "../../../impower-route";
import {
  previewHeader,
  elementHeader,
  variableHeader,
  triggerHeader,
  commandHeader,
  HeaderType,
  gameSetupHeader,
  projectSetupHeader,
  HeaderInfo,
  accessSetupHeader,
} from "./headers";
import { DataWindowType } from "../state/dataPanelState";

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

export const getSections = (windowType: DataWindowType): SectionInfo[] => {
  switch (windowType) {
    case DataWindowType.Setup:
      return ownerSetupSections;
    case DataWindowType.Entities:
      return entitySections;
    case DataWindowType.Logic:
      return logicSections;
    default:
      return [];
  }
};
