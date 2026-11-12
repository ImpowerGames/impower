export const TICKETS = "ImpowerGames/impower-internal";

export const SURFACE_SELECTORS = {
  menu: '[role="menu"]',
  addPanel: '[role="dialog"][aria-label="Add to script"]',
  assetInspector: 'section[aria-label="Asset details"]',
  projectName: 'input[aria-label="Project name"], input[aria-label="Project Name"]',
  scriptName: "input[data-script-name]",
};

export const NAMED_STEPS = {
  "app-menu": { does: "open the app menu", waitsFor: { what: "the app menu", selector: SURFACE_SELECTORS.menu } },
  dialog: { does: "open a dialog and dismiss it", builtBy: 984 },
  drawer: { does: "open the drawer or rail", waitsFor: { what: "the rail, the drawer or the phone's app menu", selector: `aside[aria-label="Sidebar"], [role="dialog"][aria-label="Menu"], ${SURFACE_SELECTORS.menu}` } },
  "file-menu": { does: "open a file row's menu", waitsFor: { what: "the row's menu", selector: SURFACE_SELECTORS.menu } },
  "asset-inspector": { does: "open the asset inspector", waitsFor: { what: "the asset inspector", selector: SURFACE_SELECTORS.assetInspector } },
  "add-menu": { does: "open the Add menu", waitsFor: { what: "the Add to script panel", selector: SURFACE_SELECTORS.addPanel } },
  "preview-settings": { does: "open the preview's settings menu", waitsFor: { what: "the preview's settings menu", selector: SURFACE_SELECTORS.menu } },
  play: { does: "press Play", waitsFor: { what: "the game", selector: "#game" } },
  problems: { does: "open the Problems panel", waitsFor: { what: "the Problems panel or the Problems to fix dialog", selector: '#problems-panel, [role="dialog"]' } },
  settings: { does: "open Settings and a named section", argument: "section", waitsFor: { what: "the Settings section", selector: "[data-settings-section]" } },
  "focus-project-name": { does: "focus the project name", waitsFor: { what: "the project name field", selector: SURFACE_SELECTORS.projectName } },
  "focus-script-name": { does: "focus the script name", waitsFor: { what: "the script name field", selector: SURFACE_SELECTORS.scriptName } },
  "wheel-list": { does: "wheel each list that holds more than fits, over its clipped text", waitsFor: { what: "the page", selector: "body" } },
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

export function shotWaitsFor(steps, index) {
  for (let at = index - 1; at >= 0; at--) {
    if (steps[at].shotOf) continue;
    return (steps[at].step && NAMED_STEPS[steps[at].step]?.waitsFor) || null;
  }
  return null;
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
