import { Identifier } from "./Identifier";

export interface IPath {
  components: Identifier[];
  dotSeparatedComponents: string;
}
