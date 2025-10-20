# Development Workflow for Theresmore-Automation

## Dev Server Setup (Recommended)

The project includes a dev server that makes testing changes much faster than copy-pasting code into Violentmonkey.

### Starting the Dev Server

```bash
npm run serve
```

This will:

- Start a web server on `http://localhost:8124`
- Watch for file changes and auto-rebuild
- Serve the latest build on every page reload

The server will keep running until you stop it (Ctrl+C).

### Installing the Dev Userscript

**One-time setup:**

1. Make sure the dev server is running (`npm run serve`)
2. Visit: **http://localhost:8124/dev.user.js**
3. Violentmonkey will prompt to install - click "Confirm Installation"
4. Remove/disable any other "Theresmore Automation" scripts to avoid conflicts

**How it works:**

The dev userscript (`dist/dev.user.js`) is a tiny loader that:

- Fetches the actual code from `http://localhost:8124/bundle.user.js` on every page load
- Uses the cached version if the server is down
- Auto-updates when you reload the game page (F5)

### Testing Changes

**Fast workflow:**

1. Make code changes in `src/`
2. Server auto-rebuilds (watch console output)
3. Reload the game page (F5)
4. New code runs immediately!

**No more copy-pasting!**

### Sharing Test Builds

When ready to test a change:

1. Ensure dev server is running
2. Share this link: **http://localhost:8124/dev.user.js**
3. User just needs to reload the game page (F5) to get latest code

### Manual Build (Production)

To create a standalone userscript without the dev server:

```bash
npm run build
```

This creates `dist/bundle.user.js` which can be:

- Copied and pasted into Violentmonkey
- Shared as a standalone file
- Released on GitHub

## Project Structure

```
src/
├── index.js              # Entry point & main loop
├── assist-mode.js        # Passive building assistant
├── data/                 # Game data (buildings, tech, etc.)
├── pages/                # Page-specific automation
├── tasks/                # UI and meta tasks
└── utils/                # Helper functions
```

## Key Files

- **`src/assist-mode.js`** - The gentle helper that prevents resource waste
- **`src/utils/reactUtil.js`** - React fiber access to game state
- **`src/tasks/managePanel.js`** - Control panel UI
- **`README.md`** - User-facing documentation

## Console Debugging

Enable debug logs by opening browser console (F12) and watching for:

- `[TA]` - All script logs
- `Assist Mode:` - Assist mode activity

Debug logs show:

- Resource percentages
- Idle timer countdown
- What buildings are being built
- Why assist mode isn't triggering

## Common Issues

**"redeclaration of const taVersion"**

- You have multiple versions of the script running
- Disable/remove all other "Theresmore Automation" scripts

**"Server is not responding"**

- Dev server isn't running - start it with `npm run serve`
- Dev userscript will use cached version as fallback

**Resources not detected**

- Game data is accessed via `MainStore.ResourcesStore.resources` (array)
- Not `MainStore.resources` (that doesn't exist)
