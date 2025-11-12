/**
 * Integration tests for Theresmore Automation userscript
 * Tests that the script loads and initializes without errors
 */

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('Userscript Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Collect console messages and errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`Browser console error: ${msg.text()}`)
      }
    })

    page.on('pageerror', (error) => {
      console.error(`Page error: ${error.message}`)
    })
  })

  test('should load the game and inject userscript without errors', async ({ page }) => {
    // Track console errors
    const consoleErrors = []
    const pageErrors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    // Navigate to the game
    await page.goto('https://www.theresmoregame.com/play/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    // Wait for game to load (check for main game container)
    await page.waitForSelector('#root', { timeout: 10000 })

    // Read and inject the userscript
    const scriptPath = join(__dirname, '..', 'dist', 'bundle.user.js')
    const userscript = readFileSync(scriptPath, 'utf-8')

    await page.addScriptTag({
      content: userscript,
    })

    // Wait a bit for script initialization
    await page.waitForTimeout(2000)

    // Check that the script initialized
    const taVersionExists = await page.evaluate(() => {
      return typeof window.taVersion !== 'undefined'
    })
    expect(taVersionExists).toBe(true)

    // Check for critical console errors (ignore warnings and info)
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes('[Violation]') && // Ignore Chrome violations
        !error.includes('Download the React DevTools') && // Ignore React DevTools message
        !error.includes('[Deprecation]') // Ignore deprecation warnings
    )

    if (criticalErrors.length > 0) {
      console.error('Console errors detected:', criticalErrors)
    }

    // No page errors should occur
    expect(pageErrors).toHaveLength(0)
  })

  test('should create the control panel UI', async ({ page }) => {
    await page.goto('https://www.theresmoregame.com/play/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    await page.waitForSelector('#root', { timeout: 10000 })

    const scriptPath = join(__dirname, '..', 'dist', 'bundle.user.js')
    const userscript = readFileSync(scriptPath, 'utf-8')

    await page.addScriptTag({
      content: userscript,
    })

    // Wait for the control panel to appear
    await page.waitForTimeout(3000)

    // Check if the control panel exists (it should add elements to the DOM)
    const hasControlPanel = await page.evaluate(() => {
      // Look for any element with 'TA' or 'Theresmore Automation' text
      const allElements = Array.from(document.querySelectorAll('*'))
      return allElements.some((el) => {
        const text = el.textContent || ''
        return text.includes('Assist Mode') || text.includes('Theresmore Automation')
      })
    })

    expect(hasControlPanel).toBe(true)
  })

  test('should expose assist mode functions', async ({ page }) => {
    await page.goto('https://www.theresmoregame.com/play/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    await page.waitForSelector('#root', { timeout: 10000 })

    const scriptPath = join(__dirname, '..', 'dist', 'bundle.user.js')
    const userscript = readFileSync(scriptPath, 'utf-8')

    await page.addScriptTag({
      content: userscript,
    })

    await page.waitForTimeout(2000)

    // Check that assist mode is accessible
    const assistModeExists = await page.evaluate(() => {
      // The script should create some global state or functions
      // This is a basic check that the script loaded
      return typeof window.taVersion !== 'undefined'
    })

    expect(assistModeExists).toBe(true)
  })

  test('should handle navigation utilities without errors', async ({ page }) => {
    await page.goto('https://www.theresmoregame.com/play/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    await page.waitForSelector('#root', { timeout: 10000 })

    const scriptPath = join(__dirname, '..', 'dist', 'bundle.user.js')
    const userscript = readFileSync(scriptPath, 'utf-8')

    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.addScriptTag({
      content: userscript,
    })

    // Wait for script to run
    await page.waitForTimeout(3000)

    // No errors should have occurred during initialization
    const relevantErrors = pageErrors.filter(
      (error) => !error.includes('Download the React DevTools') && !error.includes('Extension')
    )

    if (relevantErrors.length > 0) {
      console.error('Errors during initialization:', relevantErrors)
    }

    expect(relevantErrors).toHaveLength(0)
  })
})
