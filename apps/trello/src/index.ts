import config from "../embody.config.js";
import { createAppHost } from "@embody/host";

if (process.env.DATABASE_URL) {
  throw new Error("Trello v1 supports SQLite only; PostgreSQL graph isolation has not been verified.");
}
const runtime = await createAppHost(config, {
  env: { PORT: String(config.port), DATABASE_FILE: config.sqlitePath, ...process.env },
});
await runtime.start();
console.log(runtime.url);
const close = () => void runtime.stop().catch(error => { console.error(error); process.exitCode = 1; });
process.once("SIGINT", close);
process.once("SIGTERM", close);
