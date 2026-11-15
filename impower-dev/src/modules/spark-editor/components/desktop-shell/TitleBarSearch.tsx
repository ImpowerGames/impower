import { Button, SearchIcon } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { routeOfState } from "../../workspace/routes";
import workspace from "../../workspace/WorkspaceStore";
import { openFind } from "../find-references-rename";
import { withWindow } from "./workspaceWindow";

const searchStory = () =>
  void withWindow((win) => win.navigateTo("write")).then(openFind);

export default function TitleBarSearch() {
  const writing = useComputed(
    () => routeOfState(workspace.state.value) === "write",
  ).value;
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label="Search"
      title="Search"
      class="text-muted"
      data-title-bar-search
      onClick={writing ? openFind : searchStory}
    >
      <SearchIcon />
    </Button>
  );
}
