/**
 * Add battle prediction to Army > Attack page
 * Shows if a battle is winnable before attacking
 */

import { CONSTANTS, navigation, armyCalculator, reactUtil } from '../utils'

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
    if (!container) return null

    const boxes = [...container.querySelectorAll('div.grid > div.flex')]
    if (!boxes.length) return null

    const controlBox = boxes[0]
    if (!controlBox) return null

    // Find enemy name display (h5 element)
    const enemyName = controlBox.querySelector('h5')
    if (!enemyName) return null

    // Get the React key which contains the enemy ID
    const key = reactUtil.getNearestKey(enemyName, 2)
    if (!key || !key.startsWith('enemy_')) return null

    // Extract enemy ID from key (format: "enemy_<id>")
    const enemyId = key.replace('enemy_', '')
    return enemyId
  } catch (e) {
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
  if (!container) return

  // Create prediction element if it doesn't exist
  if (!predictionElement) {
    predictionElement = createPredictionElement()

    const boxes = [...container.querySelectorAll('div.grid > div.flex')]
    if (!boxes.length) return

    const controlBox = boxes[0]
    if (!controlBox) return

    // Find the attack button's parent to insert prediction above it
    const attackButton = [...controlBox.querySelectorAll('button.btn')].find((button) => reactUtil.getBtnIndex(button, 0) === 3)
    if (!attackButton) return

    // Insert prediction element before the attack button's parent container
    const buttonContainer = attackButton.parentElement
    if (buttonContainer) {
      buttonContainer.insertAdjacentElement('beforebegin', predictionElement)
    }
  }

  // Check selected enemy
  const currentEnemyId = getSelectedEnemy()

  // Only recalculate if enemy changed
  if (currentEnemyId !== lastEnemyId) {
    lastEnemyId = currentEnemyId

    if (!currentEnemyId) {
      updatePrediction(null, false)
    } else {
      // Calculate if battle is winnable
      const canWin = armyCalculator.canWinBattle(currentEnemyId, false, false, false)
      updatePrediction(currentEnemyId, canWin)
    }
  }
}

export default addBattlePrediction
