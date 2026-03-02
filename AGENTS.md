# Repository Guidelines

## Project Structure & Module Organization
This project is a Nuxt 4 app with a clear split between client and server code.

- `app/`: frontend application code (`components/`, `pages/`, `layouts/`, `composables/`, `store/`, `utils/`)
- `server/`: Nitro server handlers (`api/` endpoints, `routes/`, shared `utils/`)
- `public/`: static assets (served as-is)
- `i18n/` and `locales/`: localization config and messages
- `types/`: shared TypeScript type declarations
- `scripts/`: utility scripts for local development/maintenance

Follow existing patterns: PascalCase for Vue components (for example `MarkdownEditor.vue`), `useXxx.ts` for composables, and file-based API routes in `server/api`.

## Build, Test, and Development Commands
Use `pnpm` (see `packageManager` in `package.json`).

- `pnpm dev`: start local dev server on `http://localhost:3000`
- `pnpm build`: production build (`nuxt build`)
- `pnpm preview`: preview the built app locally
- `pnpm lint`: run ESLint checks
- `pnpm lint:fix` or `pnpm format`: auto-fix lint/style issues
- `pnpm typecheck`: run Nuxt/Vue TypeScript checks
- `pnpm deploy` / `pnpm deploy:preview`: build and deploy with Wrangler

## Coding Style & Naming Conventions
- Indentation: 2 spaces; UTF-8; LF line endings (`.editorconfig`)
- Prefer TypeScript and Vue 3 Composition API patterns already used in `app/`
- Keep utility/composable names descriptive (`useDocuments`, `useEditorToolbar`)
- Keep API handlers scoped by domain (`server/api/documents/*`, `server/api/auth/*`)
- Let ESLint drive style; run lint before pushing

## Testing Guidelines
There is currently no dedicated unit test suite committed. For every change:

- run `pnpm lint`
- run `pnpm typecheck`
- validate key flows in `pnpm dev` (editing, auth, document CRUD, uploads)

If you add tests, place them near related code or in a dedicated `tests/` folder, and use `*.test.ts` naming.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit style (for example `feat: ...`, `refactor: ...`).

- Commit format: `<type>: <imperative summary>`
- Keep commits focused and logically grouped
- PRs should include: purpose, scope, screenshots/GIFs for UI changes, and linked issues
- Note any config or env changes explicitly (for example blob storage or Cloudflare settings)

## Security & Configuration Tips
- Do not commit secrets from `.env` (tokens, API keys, blob credentials)
- Prefer environment variables for runtime config
- For storage/deploy changes, document required variables in the PR description
