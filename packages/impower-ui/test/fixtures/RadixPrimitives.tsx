import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";

export function PortalDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger data-testid="dialog-trigger">Open dialog</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>Portal dialog title</Dialog.Title>
          <Dialog.Description>Portal dialog body</Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function OpenDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Content data-testid="dialog-content">
        <Dialog.Title>Open dialog title</Dialog.Title>
        <Dialog.Description>Open dialog body</Dialog.Description>
        <Dialog.Close>Close</Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function Menu() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger data-testid="menu-trigger">Menu</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content>
          <DropdownMenu.Item>Menu item</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Choice() {
  return (
    <Select.Root defaultValue="b">
      <Select.Trigger data-testid="select-trigger" aria-label="Choice">
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content>
          <Select.Viewport>
            <Select.Item value="a">
              <Select.ItemText>Choice A</Select.ItemText>
            </Select.Item>
            <Select.Item value="b">
              <Select.ItemText>Choice B</Select.ItemText>
            </Select.Item>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function TabStrip() {
  return (
    <Tabs.Root defaultValue="one">
      <Tabs.List aria-label="Tab strip">
        <Tabs.Trigger value="one">Tab one</Tabs.Trigger>
        <Tabs.Trigger value="two">Tab two</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="one">Panel one</Tabs.Content>
      <Tabs.Content value="two">Panel two</Tabs.Content>
    </Tabs.Root>
  );
}

export function Hint() {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger data-testid="tooltip-trigger">Hover me</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content>Tooltip text</Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
