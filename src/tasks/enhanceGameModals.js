/**
 * Enhance game modals with quality-of-life improvements
 * - Click outside modal to close it
 */

import { logger } from '../utils'

const enhancedModals = new WeakSet()

/**
 * Add click-outside-to-close to a game modal
 */
const enhanceModal = (modalTitle) => {
  // Don't enhance the same modal twice
  if (enhancedModals.has(modalTitle)) {
    return
  }

  try {
    // Find the modal container (3 levels up from h3.modal-title)
    const modalContainer = modalTitle.parentElement?.parentElement?.parentElement
    if (!modalContainer) {
      return
    }

    // Find the close button
    const closeButton = modalContainer.querySelector('div.absolute > button')
    if (!closeButton) {
      return
    }

    // Find the backdrop/overlay (usually the parent of the modal container)
    const backdrop = modalContainer.parentElement
    if (!backdrop) {
      return
    }

    // Add click handler to backdrop
    const clickHandler = (e) => {
      // Find the modal's inner content area (usually has class with 'bg-' or similar)
      const modalInner = modalContainer.querySelector('.taAssistPanelInner, .modal-content, [class*="bg-"]')

      // Close if click is outside the inner content
      if (modalInner && !modalInner.contains(e.target)) {
        logger({ msgLevel: 'debug', msg: 'Modal: Click outside detected, closing modal' })
        closeButton.click()
      } else if (!modalContainer.contains(e.target)) {
        // Fallback: close if click is completely outside modal container
        logger({ msgLevel: 'debug', msg: 'Modal: Click outside detected, closing modal' })
        closeButton.click()
      }
    }

    backdrop.addEventListener('click', clickHandler)
    enhancedModals.add(modalTitle)

    logger({ msgLevel: 'debug', msg: 'Modal: Enhanced game modal with click-outside-to-close' })
  } catch (e) {
    // Silently fail - don't break the game if modal structure changes
    logger({ msgLevel: 'debug', msg: `Modal: Failed to enhance modal: ${e.message}` })
  }
}

/**
 * Watch for new modals appearing and enhance them
 */
const startWatchingModals = () => {
  // Enhance any existing modals
  document.querySelectorAll('h3.modal-title').forEach(enhanceModal)

  // Watch for new modals
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node contains modal titles
            const modalTitles = node.querySelectorAll ? node.querySelectorAll('h3.modal-title') : []
            modalTitles.forEach(enhanceModal)

            // Check if the added node itself is a modal title
            if (node.matches && node.matches('h3.modal-title')) {
              enhanceModal(node)
            }
          }
        })
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  logger({ msgLevel: 'debug', msg: 'Modal: Started watching for game modals' })
}

export default startWatchingModals
