import type { Element } from "parse5/dist/tree-adapters/default";

const findSlots = (node: Element): Element[] => {
  const elements: Element[] = [];
  const find = (node: Element) => {
    for (const child of node.childNodes) {
      if ("tagName" in child && child.tagName === "slot") {
        elements.push(child);
      }
      if ("childNodes" in child && child.childNodes) {
        find(child);
      }
    }
  };
  find(node);
  return elements;
};

const findInserts = (node: Element) => {
  const elements = [];
  for (const child of node.childNodes) {
    if ("attrs" in child) {
      const hasSlot = child.attrs?.find((attr) => attr.name === "slot");
      if (hasSlot) {
        elements.push(child);
      }
    }
  }
  return elements;
};

const fillSlots = (node: Element, template: Element) => {
  const slots = findSlots(template);
  const inserts = findInserts(node);
  const usedSlots = [];
  for (let i = 0; i < slots.length; i++) {
    let hasSlotName = false;
    const slot = slots[i];
    if (slot) {
      const slotAttrs = slot.attrs || [];

      const slotAttrsLength = slotAttrs.length;
      for (let i = 0; i < slotAttrsLength; i++) {
        const attr = slotAttrs[i];
        if (attr && attr.name === "name") {
          hasSlotName = true;
          const slotName = attr.value;
          const insertsLength = inserts.length;
          for (let i = 0; i < insertsLength; i++) {
            const insert = inserts[i];
            if (insert) {
              const insertAttrs = insert.attrs || [];

              const insertAttrsLength = insertAttrs.length;
              for (let i = 0; i < insertAttrsLength; i++) {
                const attr = insertAttrs[i];
                if (attr && attr.name === "slot") {
                  const insertSlot = attr.value;
                  if (insertSlot === slotName) {
                    slot.childNodes.push(insert);
                    usedSlots.push(slot);
                  }
                }
              }
            }
          }
        }
      }

      if (!hasSlotName) {
        slot.childNodes.length = 0;
        const children = node.childNodes.filter(
          (n) => !inserts.includes(n as Element)
        );
        slot.childNodes.push(...children);
      }
    }
  }

  const nodeChildNodes = node.childNodes;
  nodeChildNodes.splice(0, nodeChildNodes.length, ...template.childNodes);
};

export default fillSlots;
