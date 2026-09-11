import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { deliver, alertShape, withDeviceLease } from './alerts.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter(arg => arg !== '--dry-run');
const notify = input => dryRun ? deliver(input, { dryRun }) : withDeviceLease(() => deliver(input));
if (positional[0] === 'notify') {
  try {
    const result = await notify({ reason: positional[1], message: positional.slice(2).join(' ') });
    console.log(JSON.stringify(result, null, 2));
    if (Object.values(result.channels || {}).some(channel => channel.status === 'error')) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 1; }
} else if (positional.length === 0 || positional[0] === 'mcp') {
  const server = new McpServer({ name: 'agent-notification-alerts', version: '0.1.0' });
  let queue = Promise.resolve();
  server.registerTool('notify_user', {
    description: 'Notify the user through local keyboard lighting and spoken audio. Call when user input, permission, PR review or merge is needed. Use a concise message identifying the task and next action. This only notifies; it does not approve or merge anything.',
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
  console.error('Usage: node src/main.mjs [mcp | notify REASON MESSAGE] [--dry-run]');
  process.exitCode = 1;
}
