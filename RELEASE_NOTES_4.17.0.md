# Release 4.17.0 - Assist Mode Safety Improvements

This release focuses on making assist mode smarter and safer, preventing it from making strategic choices that should be left to the player.

## 🎯 Key Fixes

### Mutually Exclusive Prayers

Assist mode no longer auto-chooses strategic prayer decisions:

- desire_abundance/desire_magic/desire_war
- focus_development/focus_magic/focus_research
- accept_druid/banish_druid
- incremental_power/protection_power
- And 10 other mutually exclusive prayer groups

### Smart Food Safety

Improved food production logic:

- Only builds housing when food production buffer exists
- Example: Won't build Common House (-0.5 food/s) unless production > 0.5/s
- Can still build farms to recover from negative food situations
- Prevents assist mode from ever causing negative food production

### Accurate Resource Cap Detection

Fixed resource capacity calculation:

- Now reads caps directly from game state instead of parsing DOM
- Respects all bonuses: buildings, legacies, NG+ modifiers
- Fixes "20425% full" errors and premature building

### Enhanced Debug Logging

Better visibility into assist mode decisions:

- Shows when buildings cost Lucky Stones
- Shows when housing is blocked due to food safety
- Shows when prayers are mutually exclusive
- Helps diagnose any future issues

## 🧪 Testing

Added comprehensive test coverage for all safety features with 4 test suites covering:

- Lucky Stone building detection (8 buildings)
- Strategic building blacklist (7 buildings)
- Mutually exclusive prayers (18 prayers)
- Food safety logic (3 scenarios)

All tests pass ✅

## 📦 Installation

Install directly from the release file: `release-4.17.0.user.js`

Or update from: https://github.com/asbjornb/Theresmore-Automation/raw/main/dist/release-4.17.0.user.js

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
