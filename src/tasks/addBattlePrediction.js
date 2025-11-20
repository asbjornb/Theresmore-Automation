/**
 * Add battle prediction to Army > Attack page
 * Shows if a battle is winnable before attacking
 */

import { CONSTANTS, navigation, armyCalculator, reactUtil, logger } from '../utils'

let lastEnemyId = null
let predictionElement = null

/**
 * Create the prediction UI element
 */
const createPredictionElement = () => {
  const el = document.createElement('div')
  el.classList.add('taBattlePrediction', 'mb-2', 'p-2', 'rounded', 'text-sm')
  el.style.display = 'none'
  return el
}

/**
 * Update prediction display
 */
const updatePrediction = (enemyId, canWin) => {
  if (!predictionElement) return

  if (!enemyId) {
    predictionElement.style.display = 'none'
    return
  }

  // Get difficulty to show appropriate warning
  const difficultyMode = parseInt(reactUtil.getGameData()?.SettingsStore?.difficultyMode, 10) || 0
  const isHigherDifficulty = difficultyMode >= 2 // Hard or Nightmare

  predictionElement.style.display = 'block'

  if (canWin) {
    predictionElement.className = 'taBattlePrediction mb-2 p-2 rounded text-sm bg-green-900 text-green-200'
    predictionElement.innerHTML = `
      <div class="font-bold">✓ Battle Prediction: Winnable</div>
      ${
        isHigherDifficulty
          ? '<div class="text-xs mt-1 opacity-80">Note: Estimate based on simulation. Higher difficulties have variance in enemy units and targeting.</div>'
          : ''
      }
    `
  } else {
    predictionElement.className = 'taBattlePrediction mb-2 p-2 rounded text-sm bg-red-900 text-red-200'
    predictionElement.innerHTML = `
      <div class="font-bold">✗ Battle Prediction: Not Winnable</div>
      <div class="text-xs mt-1 opacity-80">You will likely lose troops. ${isHigherDifficulty ? 'Estimate based on simulation - higher difficulties have variance.' : ''}</div>
    `
  }
}

/**
 * Get currently selected enemy ID from the Attack page
 */
const getSelectedEnemy = () => {
  try {
    const container = document.querySelector('div.tab-container.sub-container')
    if (!container) {
      logger({ msgLevel: 'debug', msg: 'Battle Prediction: No container found in getSelectedEnemy' })
      return null
    }

    const boxes = [...container.querySelectorAll('div.grid > div.flex')]
    if (!boxes.length) {
      logger({ msgLevel: 'debug', msg: 'Battle Prediction: No boxes found in getSelectedEnemy' })
      return null
    }

    const controlBox = boxes[0]
    if (!controlBox) {
      logger({ msgLevel: 'debug', msg: 'Battle Prediction: No controlBox found in getSelectedEnemy' })
      return null
    }

    // Search for any element with an enemy key in the control box
    // Try all elements, not just h5
    const allElements = controlBox.querySelectorAll('*')
    logger({ msgLevel: 'debug', msg: `Battle Prediction: Searching ${allElements.length} elements for enemy key` })

    for (const element of allElements) {
      // Try different depths
      for (let depth = 0; depth <= 5; depth++) {
        const key = reactUtil.getNearestKey(element, depth)
        if (key && key.startsWith('enemy_')) {
          const enemyId = key.replace('enemy_', '')
          logger({
            msgLevel: 'debug',
            msg: `Battle Prediction: Found enemy key at depth ${depth} in ${element.tagName}: ${enemyId}`,
          })
          return enemyId
        }
      }
    }

    logger({ msgLevel: 'debug', msg: 'Battle Prediction: No enemy key found in any element' })
    return null
  } catch (e) {
    logger({ msgLevel: 'error', msg: `Battle Prediction: Error in getSelectedEnemy: ${e.message}` })
    return null
  }
}

/**
 * Main function that runs every 100ms to update battle prediction
 */
const addBattlePrediction = () => {
  // Only run on Attack page
  if (!navigation.checkPage(CONSTANTS.PAGES.ARMY, CONSTANTS.SUBPAGES.ATTACK)) {
    lastEnemyId = null
    return
  }

  const container = document.querySelector('div.tab-container.sub-container')
  if (!container) {
    logger({ msgLevel: 'debug', msg: 'Battle Prediction: Container not found' })
    return
  }

  // Create prediction element if it doesn't exist
  if (!predictionElement) {
    logger({ msgLevel: 'debug', msg: 'Battle Prediction: Creating prediction element' })
    predictionElement = createPredictionElement()

    const boxes = [...container.querySelectorAll('div.grid > div.flex')]
    if (!boxes.length) {
      logger({ msgLevel: 'debug', msg: 'Battle Prediction: No boxes found' })
      return
    }

    const controlBox = boxes[0]
    if (!controlBox) {
      logger({ msgLevel: 'debug', msg: 'Battle Prediction: No control box found' })
      return
    }

    // Find the attack button's parent to insert prediction above it
    const attackButton = [...controlBox.querySelectorAll('button.btn')].find((button) => reactUtil.getBtnIndex(button, 0) === 3)
    if (!attackButton) {
      logger({ msgLevel: 'debug', msg: 'Battle Prediction: Attack button not found' })
      return
    }

    // Insert prediction element before the attack button's parent container
    const buttonContainer = attackButton.parentElement
    if (buttonContainer) {
      buttonContainer.insertAdjacentElement('beforebegin', predictionElement)
      logger({ msgLevel: 'debug', msg: 'Battle Prediction: Element created and inserted' })
    }
  }

  // Check selected enemy
  const currentEnemyId = getSelectedEnemy()
  logger({ msgLevel: 'debug', msg: `Battle Prediction: Checking enemy - current: ${currentEnemyId}, last: ${lastEnemyId}` })

  // Only recalculate if enemy changed
  if (currentEnemyId !== lastEnemyId) {
    lastEnemyId = currentEnemyId
    logger({ msgLevel: 'debug', msg: `Battle Prediction: Enemy changed to ${currentEnemyId || 'none'}` })

    if (!currentEnemyId) {
      updatePrediction(null, false)
    } else {
      // Calculate if battle is winnable
      logger({ msgLevel: 'debug', msg: `Battle Prediction: Calculating winnability for ${currentEnemyId}` })
      const canWin = armyCalculator.canWinBattle(currentEnemyId, false, false, false)
      logger({ msgLevel: 'debug', msg: `Battle Prediction: Result = ${canWin ? 'Winnable' : 'Not winnable'}` })
      updatePrediction(currentEnemyId, canWin)
    }
  }
}

export default addBattlePrediction
