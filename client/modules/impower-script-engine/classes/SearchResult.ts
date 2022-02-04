import { Container } from "./Container";
import { ImpowerObject } from "./ImpowerObject";

export class SearchResult {
  public obj: ImpowerObject = null;

  public approximate = false;

  get correctObj(): ImpowerObject {
    return this.approximate ? null : this.obj;
  }

  get container(): Container {
    return this.obj instanceof Container ? this.obj : null;
  }

  public copy(): SearchResult {
    const searchResult = new SearchResult();
    searchResult.obj = this.obj;
    searchResult.approximate = this.approximate;

    return searchResult;
  }
}
