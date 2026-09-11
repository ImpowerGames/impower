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
    description: 'Send an optional notification alongside the normal chat handoff when work finishes or needs user input or help, on any topic. Use one short, natural message describing the task and next action. Always provide the usual summary, links, questions and limitations in chat, whether delivery succeeds or fails. Respect the user\'s notification preferences. This local adapter uses keyboard lighting and speech; other implementations can route the same message and category to personal automations. A notification does not complete work or grant approval.',
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
