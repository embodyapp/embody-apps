# Repository conventions

- This is a pnpm workspace. Run installs from the repository root and keep one
  root `pnpm-lock.yaml`.
- Applications live in `apps/*`; reusable code lives in `packages/*`.
- Use Node.js 22 or 24, TypeScript, and ESM. Give every workspace package a unique
  name and mark applications and internal packages private.
- Scaffold new apps with `pnpm create embody-app apps/<name>`. Preserve the
  scaffold's Embody APIs and configuration; verify installed declarations rather
  than inventing framework methods.
- Use `workspace:*` for internal dependencies. Add external dependencies to the
  package that actually uses them, not to the root.
- Keep cohesive business domains in plugins. Enforce persisted invariants in
  server-side hooks/actions and use `@embody/testing` for integration tests.
- Each app owns its environment, database path, and port. Do not commit secrets,
  databases, or generated output; do not expose development inspectors publicly.
- Run `pnpm check` after changes, or use `pnpm --filter './apps/<name>' <script>`
  for targeted checks. Root scripts skip packages without the requested script;
  new packages should define build, typecheck, and test scripts as appropriate.
