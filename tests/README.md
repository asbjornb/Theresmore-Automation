# Integration Tests

Playwright-based integration tests that load the actual game and inject the userscript to verify it works correctly.

## Setup

Install dependencies (including Playwright browsers):

```bash
npm install
npx playwright install chromium
```

## Running Tests

### Run all tests (unit + integration)
```bash
npm test
```

### Run only integration tests
```bash
npm run test:integration
```

### Run with UI (interactive mode)
```bash
npm run test:integration:ui
```

### Debug mode (step through tests)
```bash
npm run test:integration:debug
```

## What Gets Tested

The integration tests:

1. **Script Loading** - Verifies the userscript loads without errors
2. **Initialization** - Checks that the script initializes and creates expected globals
3. **Control Panel** - Verifies the UI elements are created
4. **Navigation** - Tests that navigation utilities work without errors
5. **No Console Errors** - Ensures no critical errors occur during initialization

## Test Structure

- `integration.spec.js` - Main integration test suite
- Tests load the game at `https://www.theresmoregame.com/play/`
- Each test injects the built `dist/bundle.user.js` script
- Tests run in Chromium browser

## CI/CD

Integration tests are **not** run in CI because:
- They require a live browser
- They depend on the external game being available
- They may be flaky due to network conditions

Only unit tests (`npm run test:unit`) run in CI.

## Troubleshooting

**Test fails with "timeout"**
- Game might be loading slowly or unavailable
- Increase timeout in test configuration

**Script errors**
- Build the project first: `npm run build`
- Check `dist/bundle.user.js` exists

**Browser not found**
- Run `npx playwright install chromium`
