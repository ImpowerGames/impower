import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { deliver, alertShape, withDeviceLease } from './alerts.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter(arg => arg !== '--dry-run');
const notify = input => dryRun ? deliver(input, { dryRun }) : withDeviceLease(() => deliver(input));
if (positional[0] === 'notify') {
  try {
    const categoryFlag = positional.indexOf('--category');
    const category = categoryFlag === -1 ? 'done' : positional[categoryFlag + 1];
    if (categoryFlag !== -1 && !category) throw new Error('--category requires done, input_needed or blocked');
    const messageParts = positional.slice(1).filter((_, index) => categoryFlag === -1 || (index + 1 !== categoryFlag && index + 1 !== categoryFlag + 1));
    const result = await notify({ message: messageParts.join(' '), category });
    console.log(JSON.stringify(result, null, 2));
    if (Object.values(result.channels || {}).some(channel => channel.status === 'error')) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 1; }
} else if (positional.length === 0 || positional[0] === 'mcp') {
  const server = new McpServer({ name: 'agent-notification-alerts', version: '0.1.0' });
  let queue = Promise.resolve();
  server.registerTool('notify_user', {
    description: 'Speak a short, human handoff and flash the user\'s keyboard. Call once when you finish work or need the user\'s attention, on any topic. Say what you finished and what you need next, if anything: "Hey, I finished the settings page. Can you take a look?" Use this brief handoff in place of a long end-of-turn recap. Keep the final chat reply equally short; include necessary links, deliverables or unresolved blockers there. If notification fails, give the handoff in chat. This tool only delivers a message; it does not complete work or grant approval.',
    inputSchema: alertShape,
  }, async input => {
    const job = queue.then(() => notify(input));
    queue = job.catch(() => {});
    try {
      const result = await job;
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: Object.values(result.channels || {}).some(channel => channel.status === 'error') };
    } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; }
  });
  await server.connect(new StdioServerTransport());
} else {
  console.error('Usage: node src/main.mjs [mcp | notify MESSAGE [--category done|input_needed|blocked]] [--dry-run]');
  process.exitCode = 1;
}
