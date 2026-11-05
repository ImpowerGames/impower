export const TICKETS = "ImpowerGames/impower-internal";

export const NAMED_STEPS = {
  "app-menu": { does: "open the app menu", builtBy: 997 },
  dialog: { does: "open a dialog and dismiss it", builtBy: 984 },
  drawer: { does: "open the drawer or rail" },
  "file-menu": { does: "open a file row's menu" },
  "asset-inspector": { does: "open the asset inspector", builtBy: 1028 },
  "add-menu": { does: "open the Add menu", builtBy: 1013 },
  "preview-settings": { does: "open the preview's settings menu", builtBy: 1020 },
  play: { does: "press Play" },
  problems: { does: "open the Problems panel", builtBy: 1022 },
  settings: { does: "open Settings and a named section", builtBy: 1015, argument: "section" },
  "focus-project-name": { does: "focus the project name" },
  "focus-script-name": { does: "focus the script name" },
};

const stepList = () => Object.entries(NAMED_STEPS).map(([name, def]) => (def.argument ? `${name}=<${def.argument}>` : name)).join(", ");

export function parseNamedStep(spec) {
  const eq = String(spec).indexOf("=");
  const name = eq < 0 ? spec : spec.slice(0, eq);
  const argument = eq < 0 ? null : spec.slice(eq + 1);
  const def = Object.hasOwn(NAMED_STEPS, name) ? NAMED_STEPS[name] : null;
  if (!def) throw new Error(`unknown --step "${name}" (know: ${stepList()})`);
  if (def.argument && !argument) throw new Error(`--step ${name} needs a ${def.argument}, as ${name}=<${def.argument}>`);
  if (!def.argument && argument != null) throw new Error(`--step ${name} takes no value, got "${spec}"`);
  if (argument != null && !/^[a-z][a-z0-9-]*$/.test(argument)) throw new Error(`--step ${name}'s ${def.argument} is a lowercase name such as appearance, got "${argument}"`);
  return { step: name, ...(argument != null ? { [def.argument]: argument } : {}) };
}

export function notBuiltYet(step) {
  const def = NAMED_STEPS[step.step];
  if (!def?.builtBy) return null;
  return {
    ...step,
    ran: false,
    reason: `not built yet: --step ${step.step} (${def.does}) gets its body when ${TICKETS}#${def.builtBy} builds the surface`,
  };
}
