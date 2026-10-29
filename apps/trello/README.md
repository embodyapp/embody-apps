# trello

Run `pnpm install`, `pnpm test`, then `pnpm dev`. The dev host is loopback-only.

Durable workflows can be added with `defineWorkflow(inputSchema)({ version, steps })`; start them through the generated `<plugin>.<workflow>.start` action and use idempotent external side effects.

This generated application belongs to its creator and is UNLICENSED by default. Choose and add your own license before distributing it.
