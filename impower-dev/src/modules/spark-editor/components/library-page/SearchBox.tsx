import {
  Button,
  CloseIcon,
  SearchIcon,
  TextField,
} from "@impower/impower-ui/components";

export type SearchBoxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBox({ label, value, onChange }: SearchBoxProps) {
  return (
    <label class="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control border border-edge pl-3 focus-within:border-accent">
      <SearchIcon class="size-[18px] flex-none text-muted" />
      <TextField
        frame="inset"
        purpose="search"
        aria-label={label}
        placeholder={label}
        value={value}
        class="text-[16px] [:root[data-layout=desktop]_&]:text-[13px]"
        onValueChange={onChange}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
      />
      {value && (
        <Button variant="quiet" size="icon" aria-label="Clear search" class="text-muted" onClick={() => onChange("")}>
          <CloseIcon />
        </Button>
      )}
    </label>
  );
}
