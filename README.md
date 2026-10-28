# Budgie

A pnpm monorepo with applications in `apps/` and shared packages in `packages/`.
Each workspace belongs in its own subdirectory with a `package.json`.

Use pnpm 10.20.0, pinned in the root `package.json`:

```sh
corepack pnpm install
```

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days). This applies to
direct and transitive dependencies, with no age-policy exclusions configured.
Reference sibling workspace packages using the `workspace:*` protocol.
