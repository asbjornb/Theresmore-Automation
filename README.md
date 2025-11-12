# Theresmore Automation - Assist Mode Fork

Quality of life helper for the [Theresmore](https://www.theresmoregame.com/play/) game.

**Note:** This is a fork of the excellent [Theresmore-Automation](https://github.com/Theresmore-Automation/Theresmore-Automation) project, focused on providing
a simpler "Assist Mode" experience. All the hard work and foundations come from the original project - this fork just adds a gentle assistant mode on top of
that amazing codebase.

## ✨ Assist Mode (Recommended)

**Passive building assistant that respects your gameplay decisions.**

Assist Mode is a gentle helper that only acts when you're idle and resources are going to waste. It's designed to assist your manual play, not replace it.

### How It Works

1. **Waits for Idle**: Only activates after 60 seconds of no player activity
2. **Monitors Resources**: Checks if any resource reaches 90% capacity
3. **Spends Resources Wisely**:
   - **Research** (every 2 minutes): Completes safe research using capped resources
     - Skips dangerous research (fights, resets)
     - Skips mutually exclusive choices
   - **Prayers** (every 2 minutes): Uses faith for prayers when it's capped
   - **Buildings** (every 5 seconds): Builds affordable safe buildings that use the capped resource
4. **Stays Safe**:
   - Won't build statues or shrines (strategic choices are yours)
   - Won't build Pillars of Mana (negative gold production)
   - Won't build anything that would make food production negative
   - Won't build with Lucky Stones (too valuable)
   - Won't research anything that triggers fights or resets the game
5. **Minimal Interference**: Takes one action at a time with appropriate cooldowns

### Usage

1. Enable the "Assist Mode" checkbox in the control panel (top-right of game)
2. Play normally - the script won't interfere while you're active
3. Step away or stop clicking - after 60 seconds, it will prevent resource waste
4. Check browser console (F12) to see what it's doing

**This mode is perfect for playing with friends without feeling like you're "cheating" - you're still making all the strategic decisions!**

### Army Assistant (Manual Helper)

**Active helper button for scouting and fighting - removes tedium while preserving strategy.**

A "🗡️ Auto Scout & Fight" button appears on the **Army > Attack** page that automates the repetitive clicking of war actions:

#### How It Works

1. **Player Sets Up**: Navigate to Army page, hire scouts and fill your army (strategic decisions are yours)
2. **Click Button**: Go to the Attack tab and press "🗡️ Auto Scout & Fight" at the top of the page
3. **Automatic Execution**:
   - Sends scouting missions until <10 scouting units remain
   - Picks easiest fight first (counts skull icons)
   - Consults oracle before each battle
   - Only fights if oracle says winnable
   - Alternates scouting/fighting for efficiency (actions are on cooldowns)
4. **Smart Stops**: Automatically stops when:
   - <10 scouting units left
   - Encounters unwinnable fight
   - Out of resources (gold, food, etc.)
   - Encounters blacklisted fight (see below)

#### ⚠️ Fight Blacklist - IMPORTANT

Some fights trigger **permanent incoming faction attacks** and are automatically skipped:

- **barbarian_village** → Triggers Barbarian Horde attacks
- **kobold_city** → Triggers King Kobold Nation attacks
- **orcish_prison_camp** → Triggers Orc Horde attacks
- **huge_cave** → Triggers Nikharul attacks
- **dark_knight_patrol** → Triggers Dark Knight attacks

These are strategic decisions - the assistant will never auto-fight them. You can still manually fight these when you're ready for sustained conflict!

---

## Installation

Install an extension that supports Userscripts, like [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).

Then simply open
[https://github.com/asbjornb/Theresmore-Automation/releases/latest/download/bundle.user.js](https://github.com/asbjornb/Theresmore-Automation/releases/latest/download/bundle.user.js)
to have the script installed.

## Development

Start by installing dependencies with `npm install`.

### Bundle

Bundle everything from `src/` into `dist/bundle.user.js`:

`npm run build`

### Development server

`npm run serve`

This will automatically update `dist/bundle.user.js` when code changes and serve it on [localhost:8124](http://localhost:8124/).

It also creates a second userscript `dist/dev.user.js`, if you install it in Tampermonkey, it will automatically fetch the latest version from
http://localhost:8124/bundle.user.js once you reload a website with F5.

### Bundle without source map

Bundle for publishing without sourcemapping to `dist/release-3.2.1.user.js`

`npm run build:release`

or on Windows

`npm run build:release:win32`

## Other

- Template based on [rollup-userscript-template](https://github.com/cvzi/rollup-userscript-template)
- Options are imported/exported using [LZString](https://github.com/pieroxy/lz-string)

## Advanced Automation (Optional)

**Note**: The script includes more aggressive automation features that are disabled by default. These are accessible via the "Manage Options" button but are
intended for power users who want full automation.

For most players, we recommend sticking with **Assist Mode** for a more balanced experience.

### Advanced Features Include

- Full building automation with priority systems
- Automatic population management
- Marketplace trading automation
- Army recruitment, scouting, and combat
- Research automation
- Prestige and New Game+ automation

### Usage Tips (Advanced Mode)

- Each section is independently enabled/disabled
- It is generally safe to enable all production/buildings. You may want to select the mutually exclusive buildings (like `Statue of Atamar/Firio/Lurezia` or
  `Harvest/War/Mind Shrine`) by hand, and limit how many `Pillars of Mana` you want built
- The `Marketplace` can help overcome some gold problems. Be sure to tweak the numbers to match your production speed, allowing enough time for the prices to
  return to normal. Try starting with limited amount of resources to sell (like `Cows`) until you feel comfortable to enable others
- The `Population` tab can help auto-assign workers. Take note of `Minimum food` toggle at bottom
- When you're ready for some action, you can automate army production, scouting, and fighting in the `Army` tab
