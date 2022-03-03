import { FountainVariable } from "../../../impower-script-parser";

export const getFountainVariable = (
  name: string,
  sectionId: string,
  variables: Record<string, FountainVariable>
): FountainVariable => {
  return variables?.[`${sectionId}.${name}`] || variables?.[`.${name}`];
};
