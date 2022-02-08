import {
  Container,
  List,
  ListItem,
  ListValue,
} from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedListDefinition } from "./ParsedListDefinition";

export class ParsedList extends ParsedExpression {
  itemIdentifierList: Identifier[];

  constructor(itemIdentifierList: Identifier[]) {
    super();
    this.itemIdentifierList = itemIdentifierList;
  }

  override GenerateIntoContainer(container: Container): void {
    const runtimeRawList = new List();

    if (this.itemIdentifierList != null) {
      this.itemIdentifierList.forEach((itemIdentifier) => {
        const nameParts = itemIdentifier?.name.split(".");

        let listName: string = null;
        let listItemName: string = null;
        if (nameParts.length > 1) {
          [listName, listItemName] = nameParts;
        } else {
          [listItemName] = nameParts;
        }

        const listItem = this.story.ResolveListItem(
          listName,
          listItemName,
          this
        );
        if (listItem == null) {
          if (listName == null) {
            this.Error(
              `Could not find list definition that contains item '${itemIdentifier}'`
            );
          } else {
            this.Error(`Could not find list item ${itemIdentifier}`);
          }
        } else {
          if (listName == null) {
            listName = (listItem.parent as ParsedListDefinition)?.identifier
              ?.name;
          }
          const item = new ListItem(listName, listItem.name);

          if (runtimeRawList.ContainsKey(item)) {
            this.Warning(`Duplicate of item '${itemIdentifier}' in list.`);
          } else {
            runtimeRawList[item.serialized()] = listItem.seriesValue;
          }
        }
      });
    }

    container.AddContent(new ListValue(runtimeRawList));
  }
}
