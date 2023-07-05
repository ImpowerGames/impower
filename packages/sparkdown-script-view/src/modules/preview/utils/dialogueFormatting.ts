import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { Extension, RangeSet, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { printTree } from "../../../cm-textmate/utils/printTree";

const NODE_NAMES = {
  Dialogue: "Dialogue",
  Dialogue_begin_dual: "Dialogue_begin-c6",
};

interface DialogueBlock {
  from: number;
  to: number;
  center?: string;
  left?: string;
  right?: string;
}

class DialogueWidget extends WidgetType {
  readonly center?: string;
  readonly left?: string;
  readonly right?: string;

  constructor(block: DialogueBlock) {
    super();
    this.center = block.center;
    this.left = block.left;
    this.right = block.right;
  }

  override eq(other: DialogueWidget) {
    return (
      other.center === this.center &&
      other.left === this.left &&
      other.right === this.right
    );
  }

  toDOM() {
    const container = document.createElement("div");
    container.classList.add("cm-line");
    container.style.marginLeft = "auto";
    container.style.marginRight = "auto";
    if (this.center) {
      container.style.width = "68%";
      container.textContent = this.center;
    } else if (this.left || this.right) {
      container.style.width = "95%";
      container.style.display = "flex";
      container.style.flexDirection = "row";
      if (this.left) {
        const leftEl = document.createElement("div");
        leftEl.classList.add("cm-block-left");
        leftEl.style.display = "inline-block";
        leftEl.style.flex = "1 1 0";
        leftEl.textContent = this.left;
        container.appendChild(leftEl);
      }
      if (this.right) {
        const rightEl = document.createElement("div");
        rightEl.classList.add("cm-block-right");
        rightEl.style.display = "inline-block";
        rightEl.style.flex = "1 1 0";
        rightEl.textContent = this.right;
        container.appendChild(rightEl);
      }
    }
    return container;
  }
}

const dialogueDecoration = (block: DialogueBlock) => {
  return Decoration.replace({
    widget: new DialogueWidget(block),
    block: true,
  });
};

const decorate = (state: EditorState) => {
  const blocks: DialogueBlock[] = [];
  syntaxTree(state).iterate({
    enter: (nodeRef) => {
      const { type, from, to } = nodeRef;
      const content = state.doc.sliceString(from, to);
      if (type.name === NODE_NAMES.Dialogue) {
        let isDual = false;
        const tree = nodeRef.node.toTree();
        console.log(printTree(tree, content));
        tree.iterate({
          enter: (childNodeRef) => {
            if (childNodeRef.type.name === NODE_NAMES.Dialogue_begin_dual) {
              const capture = content.slice(childNodeRef.from, childNodeRef.to);
              if (capture) {
                isDual = true;
              }
            }
          },
        });
        if (isDual) {
          const prevBlock = blocks[blocks.length - 1];
          if (prevBlock) {
            prevBlock.left = prevBlock.center;
            prevBlock.right = content;
            prevBlock.center = "";
            prevBlock.to = to;
          }
        } else {
          blocks.push({
            from,
            to,
            center: content,
          });
        }
      }
    },
  });

  return blocks.length > 0
    ? RangeSet.of(blocks.map((b) => dialogueDecoration(b).range(b.from, b.to)))
    : Decoration.none;
};

const dialogueDecorations = StateField.define<DecorationSet>({
  create(state) {
    return decorate(state);
  },
  update(images, transaction) {
    if (transaction.docChanged) {
      return decorate(transaction.state);
    }
    return images.map(transaction.changes);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

const dialogueFormatting = (): Extension => {
  return [dialogueDecorations];
};

export default dialogueFormatting;
