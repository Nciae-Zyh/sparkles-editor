# Sparkles-Editor

Notion-like WYSIWYG editor with real-time collaboration in Vue & Nuxt. Built with Nuxt UI and TipTap, showcasing the powerful `UEditor` component with advanced editing capabilities.

## Features

- **Rich Text Editing** - Full formatting support with headings, lists, blockquotes, and code blocks
- **Tables** - Insert and edit tables with row/column controls and cell selection
- **Bubble & Fixed Toolbars** - Contextual toolbars that adapt to your selection
- **Drag Handle** - Easily reorder, duplicate, or delete content blocks
- **Slash Commands** - Type `/` to access quick insertion commands
- **Image Upload** - Custom image upload node with blob storage support and alt text editing
- **Emoji Picker** - Full GitHub emoji set with `:emoji:` syntax
- **Markdown Support** - Content type set to markdown for easy serialization
- **Real-time Collaboration** - Optional collaborative editing powered by PartyKit

## Quick Start

Clone the repository and install dependencies:

## Setup

Make sure to install the dependencies:

```bash
pnpm install
```

### Blob Storage (Optional)

This template uses NuxtHub Blob for image uploads, which supports multiple storage providers:

- **Local filesystem** (default for development)
- **Vercel Blob** (auto-configured when deployed to Vercel)
- **Cloudflare R2** (auto-configured when deployed to Cloudflare)
- **Amazon S3** (with manual configuration)

For **Vercel Blob** (used by default via `@vercel/blob`), assign a Blob Store to your project from the Vercel dashboard (Project → Storage), then set the token for local development:

```bash
BLOB_READ_WRITE_TOKEN=<your-vercel-blob-token>
```

For **S3-compatible storage**, set:

```bash
S3_ACCESS_KEY_ID=<your-access-key-id>
S3_SECRET_ACCESS_KEY=<your-secret-access-key>
S3_BUCKET=<your-bucket-name>
S3_REGION=<your-region>
```

> Without configuration, files are stored locally in `.data/blob` during development.

### Collaboration (Optional)

This template includes optional real-time collaboration powered by Y.js, a CRDT framework for building collaborative applications. This example uses PartyKit as the Y.js provider, but you can swap it for alternatives like Liveblocks or Tiptap Collaboration.

To enable collaboration with PartyKit:

1. Create and deploy a PartyKit server:

```bash
npm create partykit@latest
npx partykit deploy
```

2. Set your PartyKit host in `.env`:

```bash
NUXT_PUBLIC_PARTYKIT_HOST=your-project.username.partykit.dev
```

3. Add `?room=your-room-name` to the URL to collaborate. All users with the same room name will edit together in real-time.

> Without the environment variable or `?room=` parameter, the editor works standalone without collaboration.

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

For more information about deployment, refer to the Nuxt documentation.
