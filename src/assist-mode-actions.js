/**
 * AssistModeActions - Encapsulates all automated actions for assist mode
 *
 * This class handles:
 * - Tracking user activity vs automated actions
 * - Preventing assist mode from resetting its own idle timer
 * - Providing clean interfaces for clicking, navigating, etc.
 */

import { logger } from './utils'

class AssistModeActions {
  constructor() {
    this.lastUserActivity = Date.now()
    this.lastActiveTab = null
    this.isActing = false // Flag to distinguish automated actions from user actions
    this.automatedClicksPending = 0 // Track automated clicks we're about to make
  }

  /**
   * Initialize activity monitoring (call once on startup)
   */
  initActivityMonitor() {
    if (typeof window === 'undefined') return

    // Listen for clicks and detect user activity
    document.addEventListener('click', (event) => {
      // Only track trusted (real user) clicks, not programmatic ones
      // Also check coordinates as fallback (programmatic clicks often have invalid coords)
      const isTrustedClick = event.isTrusted
      const hasValidCoords = event.clientX > 0 && event.clientY > 0

      // Log for debugging
      logger({
        msgLevel: 'debug',
        msg: `Click detected - isTrusted: ${isTrustedClick}, coords: (${event.clientX}, ${event.clientY}), isActing: ${this.isActing}, pending: ${this.automatedClicksPending}`,
      })

      // Require BOTH isTrusted AND valid coordinates for extra safety
      if (!isTrustedClick || !hasValidCoords) {
        return
      }

      // During automation: check if this click was expected
      if (this.isActing) {
        if (this.automatedClicksPending > 0) {
          // Expected automated click
          this.automatedClicksPending--
          logger({ msgLevel: 'debug', msg: 'Assist Mode: Automated click consumed' })
        } else {
          // Unexpected click during automation = user is active!
          this.lastUserActivity = Date.now()
          logger({ msgLevel: 'log', msg: '🎮 Player activity detected - assist mode will pause after current action' })
        }
      } else {
        // Not during automation: track as user activity
        this.lastUserActivity = Date.now()
        logger({ msgLevel: 'debug', msg: 'Assist Mode: Activity detected (click)' })
      }
    })

    // Reset idle timer on keypresses (always user-initiated)
    document.addEventListener('keypress', () => {
      this.lastUserActivity = Date.now()
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Activity detected (keypress)' })
    })

    // Watch for tab changes as user activity (but only ACTUAL user changes, not assist mode)
    const tabContainer = document.querySelector('#maintabs-container [role="tablist"]')
    if (tabContainer) {
      const observer = new MutationObserver(() => {
        if (this.isActing) return

        const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')
        if (activeTab) {
          const currentTab = activeTab.textContent
          // Only reset if tab actually changed
          if (this.lastActiveTab && this.lastActiveTab !== currentTab) {
            this.lastUserActivity = Date.now()
            logger({ msgLevel: 'debug', msg: `Assist Mode: Activity detected (tab change to ${currentTab})` })
          }
          this.lastActiveTab = currentTab
        }
      })

      observer.observe(tabContainer, {
        attributes: true,
        attributeFilter: ['aria-selected'],
        subtree: true,
      })
    }
  }

  /**
   * Check if user is idle (60 seconds with no interaction)
   */
  isUserIdle(idleThresholdMs = 60000) {
    const idleTime = Date.now() - this.lastUserActivity
    return idleTime > idleThresholdMs
  }

  /**
   * Get idle time in seconds (for logging)
   */
  getIdleTimeSeconds() {
    return Math.floor((Date.now() - this.lastUserActivity) / 1000)
  }

  /**
   * Execute an automated action (wraps it to prevent idle timer reset)
   * @param {Function} action - The async function to execute
   * @returns {Promise} - Result of the action
   */
  async executeAction(action) {
    this.isActing = true
    try {
      return await action()
    } finally {
      this.isActing = false
    }
  }

  /**
   * Click a button (convenience wrapper)
   */
  async click(button) {
    return this.executeAction(() => {
      this.automatedClicksPending++
      button.click()
    })
  }

  /**
   * Navigate to a page (convenience wrapper)
   */
  async navigate(navigationFn) {
    return this.executeAction(navigationFn)
  }
}

// Export singleton instance
export default new AssistModeActions()
