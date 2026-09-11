import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { deliver, alertShape } from './alerts.mjs';
import { z } from 'zod';
import { requestBroker } from './broker.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter(arg => arg !== '--dry-run');
const app = ['codex', 'claude'].includes(process.env.AGENT_ALERT_APP) ? process.env.AGENT_ALERT_APP : 'other';
const notify = input => dryRun ? deliver(input, { dryRun }) : requestBroker({ type: 'notify', app, alert: input });
const acknowledge = notificationId => dryRun ? { dryRun: true, notificationId } : requestBroker({ type: 'acknowledge', app, notificationId });
if (positional[0] === 'notify') {
  try {
    const categoryFlag = positional.indexOf('--category');
    const category = categoryFlag === -1 ? 'done' : positional[categoryFlag + 1];
    if (categoryFlag !== -1 && !category) throw new Error('--category requires done, input_needed or blocked');
    const sessionFlag = positional.indexOf('--session');
    if (sessionFlag !== -1 && !positional[sessionFlag + 1]) throw new Error('--session requires a verified desktop session ID');
    const messageParts = positional.slice(1).filter((_, index) => ![categoryFlag, categoryFlag === -1 ? -1 : categoryFlag + 1, sessionFlag, sessionFlag === -1 ? -1 : sessionFlag + 1].includes(index + 1));
    const result = await notify({ message: messageParts.join(' '), category, ...(sessionFlag === -1 ? {} : { session: { id: positional[sessionFlag + 1] } }) });
    console.log(JSON.stringify(result, null, 2));
    if (Object.values(result.channels || {}).some(channel => channel.status === 'error')) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 1; }
} else if (['acknowledge', 'status', 'stop'].includes(positional[0])) {
  try {
    console.log(JSON.stringify(positional[0] === 'acknowledge' ? await acknowledge(z.string().uuid().parse(positional[1])) : await requestBroker({ type: positional[0] }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
} else if (positional.length === 0 || positional[0] === 'mcp') {
  const server = new McpServer({ name: 'agent-notification-alerts', version: '0.1.0' });
  let queue = Promise.resolve();
  server.registerTool('acknowledge_notification', {
    description: 'End your earlier notification when the user replies or explicitly acknowledges or resolves it. Use its returned notificationId. This clears only that alert and never implies approval, successful completion, or permission. Call at the start of the next user turn, before more work; preserve other pending alerts.',
    inputSchema: { notificationId: z.string().uuid() },
  }, async ({ notificationId }) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await acknowledge(notificationId)) }] }; }
    catch (error) { return { content: [{ type: 'text', text: error.message }], isError: true }; }
  });
  server.registerTool('notify_user', {
    description: 'Send an optional notification alongside the normal chat handoff when work finishes or needs user input or help, on any topic. Use one short, natural message describing the task and next action. Always provide the usual summary, links, questions and limitations in chat, whether delivery succeeds or fails. Respect the user\'s notification preferences. This local adapter uses keyboard lighting and speech; other implementations can route the same message and category to personal automations. A notification does not complete work or grant approval.',
    inputSchema: alertShape,
    annotations: { title: 'Notify user (retain returned notificationId; acknowledge it when the user replies)' },
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
