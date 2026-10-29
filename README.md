# Zerthik Desktop

Zerthik is a universal AI context-to-output desktop app for Windows and macOS.

The renderer uses a familiar search-first Command Card layout, with a few Zerthik-specific additions: a centered brand strip, removable context chips, and use-case filter tabs above a simple Shortcut list. Product content is limited to the Zerthik Version 1 PRD: floating command card, saved Shortcuts, MCP connections, and an in-app dashboard. There is no AI Chat window, Clipboard History view, Snippets library, or Output History view.

The supplied Zerthik logo is included as a centered square white-on-transparent asset for the dark desktop UI, onboarding, favicon, and Electron window icon.

## Included in this preview

- Floating Command Card with a centered Zerthik logo, one clear search bar, simple Shortcut rows, and footer actions
- Removable context sources for selected text, clipboard, active app, screenshot, and MCP context
- The 24 Shortcut examples used by the Zerthik marketing site and PRD personas, grouped into Developer, Founder, Support & Ops, and Research lanes (6 jobs each)
- Simple Shortcut workspace with a Shortcut list and one vertical Context & Source → Command → Review & Insert flow
- Editable output preview with Generate, Regenerate, Insert, and Copy actions
- First-open onboarding with sign-in, 14-day Pro trial, permissions, global-hotkey recording, and a practice transform
- Shortcut Library and Create Shortcut form with output format, tone, visibility, and optional MCP configuration
- MCP Connections with disconnected-by-default example servers, tool classifications, write-action approval, and action logs
- Dashboard with familiar left-side navigation for Home, Shortcuts, MCP Connections, API Keys, Usage, Plans & Billing, Team, and Settings
- Plans & Billing with the 14-day Pro trial and hosted checkout / billing-portal entry points
- Electron main/preload shell with Zerthik's global trigger:
  - Windows: `Ctrl + Space`
  - macOS: `Option + Space`

## Run the web renderer

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Run the Electron desktop shell

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run desktop:dev
```

Or build and launch the production renderer:

```bash
npm run desktop
```

## Keyboard model

- `↑` / `↓` — navigate
- `Enter` — run primary action
- `Ctrl K` / `⌘K` — Action Panel
- `Esc` — close panel, clear search, go back, or return to the command card
- Empty search + `Backspace` — go back
- `Ctrl ,` / `⌘ ,` — Dashboard Settings
