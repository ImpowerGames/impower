// Finite private qualification fixture; no application or service startup.
const delay = Number(process.argv[2]);
if (!Number.isInteger(delay) || delay < 0 || delay > 2000) throw new Error('Invalid finite delay');
console.log(JSON.stringify({ event: 'fixture-start', pid: process.pid, delay }));
setTimeout(() => console.log(JSON.stringify({ event: 'fixture-finish', pid: process.pid })), delay);
