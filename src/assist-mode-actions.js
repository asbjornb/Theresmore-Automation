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
  }

  /**
   * Initialize activity monitoring (call once on startup)
   */
  initActivityMonitor() {
    if (typeof window === 'undefined') return

    // Reset idle timer on user clicks (but not assist mode's actions)
    document.addEventListener('click', () => {
      if (this.isActing) return
      this.lastUserActivity = Date.now()
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Activity detected (click)' })
    })

    // Reset idle timer on keypresses
    document.addEventListener('keypress', () => {
      if (this.isActing) return
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
