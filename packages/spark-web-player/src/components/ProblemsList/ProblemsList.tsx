import {
  consoleLocation,
  type ConsoleJump,
  type ConsoleSeverity,
} from "../PlayerConsole/consoleEntries";

export interface Problem {
  severity: ConsoleSeverity;
  message: string;
  path: string;
  line: number;
}

export interface ProblemsListProps {
  problems: readonly Problem[];
  onJump?: (jump: ConsoleJump) => void;
}

const groupProblemsByScript = (problems: readonly Problem[]) => {
  const groups = new Map<string, Problem[]>();
  for (const problem of problems) {
    const group = groups.get(problem.path);
    if (group) {
      group.push(problem);
    } else {
      groups.set(problem.path, [problem]);
    }
  }
  return [...groups].map(([path, entries]) => ({ path, entries }));
};

const scriptName = (path: string) => {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
};

export default function ProblemsList({ problems, onJump }: ProblemsListProps) {
  const groups = groupProblemsByScript(problems);
  if (!groups.length) {
    return (
      <section class="swp-problems" aria-label="Problems">
        <p class="swp-console-empty">No problems</p>
      </section>
    );
  }
  return (
    <section class="swp-problems" aria-label="Problems">
      {groups.map((group) => (
        <div key={group.path} class="swp-problems-script">
          <h3 class="swp-problems-heading">
            <span class="swp-problems-name">{scriptName(group.path)}</span>
            <span class="swp-problems-path">{group.path}</span>
          </h3>
          <ol class="swp-console-entries">
            {group.entries.map((problem, index) => (
              <li
                key={index}
                class="swp-console-entry"
                data-severity={problem.severity}
              >
                <span
                  class="swp-severity-glyph"
                  data-severity={problem.severity}
                />
                <span class="swp-console-message">{problem.message}</span>
                <button
                  type="button"
                  class="swp-console-jump"
                  onClick={() =>
                    onJump?.({ path: problem.path, line: problem.line })
                  }
                >
                  {consoleLocation(problem)}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
