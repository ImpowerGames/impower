import { ElementContentType } from "../../enums/elementContentType";
import { DynamicData } from "../generics/dynamicData";
import { Reference } from "../reference";

export interface ContentProps {
  type: ElementContentType;
  text: DynamicData<string>;
  component: DynamicData<Reference>;
}
