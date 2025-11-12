/**
 * Army Assistant - Active helper for scouting and fighting
 *
 * Provides a manual "Auto Scout & Fight" button that:
 * - Scouts until <10 scouting units remain
 * - Fights battles from easiest to hardest (fewest skulls first)
 * - Consults oracle before each fight
 * - Stops on: unwinnable fight, out of resources, or <10 scouts
 * - Alternates between scouting and fighting for efficiency
 */

import { units, factions, locations } from './data'
import { CONSTANTS, navigation, logger, sleep, state, reactUtil, keyGen, resources, selectors, armyCalculator } from './utils'
import actions from './assist-mode-actions'

// Fights to never auto-attack (trigger ongoing faction attacks)
// IMPORTANT: These fights unlock PERMANENT incoming attacks from factions
// Once fought, the player will face repeated attacks from:
// - barbarian_village → Barbarian Horde attacks
// - kobold_city → King Kobold Nation attacks
// - orcish_prison_camp → Orc Horde attacks
// - huge_cave → Nikharul attacks (mindless evil)
// - dark_knight_patrol → Dark Knight incoming attacks (late game Abyss)
// Player must be strategically prepared for sustained conflict!
const FIGHT_BLACKLIST = [
  'barbarian_village', // Unlocks Barbarian Horde incoming attacks
  'kobold_city', // Unlocks King Kobold Nation incoming attacks
  'orcish_prison_camp', // Unlocks Orc Horde incoming attacks
  'huge_cave', // Unlocks Nikharul incoming attacks
  'dark_knight_patrol', // Unlocks Dark Knight incoming attacks (late game Abyss)
]

// Stop flag
let shouldStop = false

/**
 * Stop the army assistant
 */
const stop = () => {
  shouldStop = true
  logger({ msgLevel: 'log', msg: 'Army Assistant: Stop requested' })
}

/**
 * Get total hired scouting units from army data
 */
const getTotalScoutingUnits = () => {
  try {
    const run = reactUtil.getGameData().run
    if (!run || !run.army) {
      return { scouts: 0, explorers: 0, familiars: 0, total: 0 }
    }

    const scoutUnit = run.army.find((u) => u.id === 'scout')
    const explorerUnit = run.army.find((u) => u.id === 'explorer')
    const familiarUnit = run.army.find((u) => u.id === 'familiar')

    // unit.value = total hired (regardless of assignment status)
    const scouts = scoutUnit?.value || 0
    const explorers = explorerUnit?.value || 0
    const familiars = familiarUnit?.value || 0

    return {
      scouts,
      explorers,
      familiars,
      total: scouts + explorers + familiars,
    }
  } catch (e) {
    logger({ msgLevel: 'error', msg: `Army Assistant: Error getting scouting units: ${e.message}` })
    return { scouts: 0, explorers: 0, familiars: 0, total: 0 }
  }
}

/**
 * Assign all units (scouts or army) using the "Add all" button
 * Based on original code's assignAll function
 */
const assignAll = (container) => {
  const allButtons = [...container.querySelectorAll('button:not(.btn)')]

  for (let i = 0; i < allButtons.length; i++) {
    const button = allButtons[i]
    const parentClasses = button.parentElement.classList.toString()
    const classesToFind = ['absolute', 'top-0', 'right-0']

    if (classesToFind.every((className) => parentClasses.includes(className))) {
      logger({ msgLevel: 'debug', msg: 'Army Assistant: Clicking assign all button' })
      button.click()
      return true
    }
  }
  return false
}

/**
 * Start scouting mission (don't wait for completion)
 */
const startScout = async () => {
  logger({ msgLevel: 'debug', msg: 'Army Assistant: Starting scout mission' })

  // Navigate to Army > Explore
  await navigation.switchPage(CONSTANTS.PAGES.ARMY)
  await sleep(500)
  await navigation.switchSubPage(CONSTANTS.SUBPAGES.EXPLORE, CONSTANTS.PAGES.ARMY)
  await sleep(1000)

  const container = document.querySelector('div.tab-container.sub-container')
  if (!container) {
    logger({ msgLevel: 'error', msg: 'Army Assistant: Could not find explore container' })
    return { success: false, reason: 'no_container' }
  }

  // Assign all scouts using proper method
  actions.automatedClicksPending++
  assignAll(container)
  await sleep(500)

  // Find and click the blue "Send to Explore" button
  const sendButton = container.querySelector('button.btn-blue:not(.btn-off):not(.btn-off-cap)')
  if (!sendButton) {
    logger({ msgLevel: 'debug', msg: 'Army Assistant: No explore button available (insufficient resources or units)' })
    return { success: false, reason: 'no_button' }
  }

  logger({ msgLevel: 'log', msg: 'Army Assistant: Sending scouting mission (not waiting for completion)' })
  actions.automatedClicksPending++
  sendButton.click()
  await sleep(500)

  return { success: true }
}

/**
 * Select a winnable fight and start it (don't wait for completion)
 */
const startFight = async () => {
  logger({ msgLevel: 'debug', msg: 'Army Assistant: Looking for fights' })

  // Navigate to Army > Attack
  await navigation.switchPage(CONSTANTS.PAGES.ARMY)
  await sleep(500)
  await navigation.switchSubPage(CONSTANTS.SUBPAGES.ATTACK, CONSTANTS.PAGES.ARMY)
  await sleep(1000)

  const container = document.querySelector('div.tab-container.sub-container')
  if (!container) {
    logger({ msgLevel: 'error', msg: 'Army Assistant: Could not find attack container' })
    return { success: false, reason: 'no_container' }
  }

  const boxes = [...container.querySelectorAll('div.grid > div.flex')]
  const controlBox = boxes.shift()

  if (!controlBox) {
    logger({ msgLevel: 'error', msg: 'Army Assistant: Could not find control box' })
    return { success: false, reason: 'no_control_box' }
  }

  // Find enemy selector button (index 1) and attack button (index 3)
  const enemySelectorButton = [...controlBox.querySelectorAll('button.btn')].find((button) => reactUtil.getBtnIndex(button, 2) === 1)
  const sendToAttackButton = [...controlBox.querySelectorAll('button.btn')].find((button) => reactUtil.getBtnIndex(button, 0) === 3)

  if (!enemySelectorButton || enemySelectorButton.disabled) {
    logger({ msgLevel: 'debug', msg: 'Army Assistant: Enemy selector button not available' })
    return { success: false, reason: 'no_selector' }
  }

  // Click enemy selector to open modal
  logger({ msgLevel: 'debug', msg: 'Army Assistant: Opening enemy selector modal' })
  actions.automatedClicksPending++
  enemySelectorButton.click()
  await sleep(500)

  // Parse enemies from modal
  const modals = [...document.querySelectorAll('h3.modal-title')]
  if (modals.length === 0) {
    logger({ msgLevel: 'error', msg: 'Army Assistant: Could not find enemy modal' })
    return { success: false, reason: 'no_modal' }
  }

  const enemyList = [...modals.map((modal) => [...modal.parentElement.querySelectorAll('h5')]).flat()]
    .map((h5) => {
      const key = reactUtil.getNearestKey(h5, 2)
      if (!keyGen.enemy.check(key)) return undefined

      const enemyDetails = [...factions, ...locations].find((fight) => keyGen.enemy.key(fight.id) === key)
      if (!enemyDetails) return undefined

      // Skip blacklisted fights
      if (FIGHT_BLACKLIST.includes(enemyDetails.id)) {
        logger({ msgLevel: 'debug', msg: `Army Assistant: Skipping blacklisted fight ${enemyDetails.id}` })
        return undefined
      }

      return {
        button: h5,
        key: enemyDetails.id,
        id: enemyDetails.id,
        level: enemyDetails.level || 0,
      }
    })
    .filter((fight) => fight)

  if (enemyList.length === 0) {
    logger({ msgLevel: 'log', msg: 'Army Assistant: No fights available' })
    // Close modal
    const closeButton = modals[0].parentElement.parentElement.parentElement.querySelector('div.absolute > button')
    if (closeButton) {
      actions.automatedClicksPending++
      closeButton.click()
      await sleep(100)
    }
    return { success: false, reason: 'no_fights' }
  }

  // Sort by level (easiest first)
  enemyList.sort((a, b) => a.level - b.level)

  // Find first winnable fight using battle calculator
  let target = null
  for (const enemy of enemyList) {
    if (shouldStop) break
    const canWin = armyCalculator.canWinBattle(enemy.key, false, false, false)
    if (canWin) {
      target = enemy
      logger({ msgLevel: 'log', msg: `Army Assistant: ${enemy.id} is winnable ✓` })
      break
    } else {
      logger({ msgLevel: 'debug', msg: `Army Assistant: ${enemy.id} is not winnable, checking next...` })
    }
  }

  if (!target) {
    logger({ msgLevel: 'log', msg: 'Army Assistant: No winnable fights found - stopping fights' })
    // Close modal
    const closeButton = modals[0].parentElement.parentElement.parentElement.querySelector('div.absolute > button')
    if (closeButton) {
      actions.automatedClicksPending++
      closeButton.click()
      await sleep(100)
    }
    return { success: false, reason: 'all_unwinnable' }
  }

  // Click target enemy in modal
  logger({ msgLevel: 'log', msg: `Army Assistant: Selecting ${target.id} to fight` })
  actions.automatedClicksPending++
  target.button.click()
  await sleep(1000)

  // Assign all army
  actions.automatedClicksPending++
  assignAll(controlBox)
  await sleep(500)

  // Attack (don't wait for completion)
  if (!sendToAttackButton || sendToAttackButton.disabled) {
    logger({ msgLevel: 'error', msg: 'Army Assistant: Attack button not available' })
    return { success: false, reason: 'no_attack_button' }
  }

  logger({ msgLevel: 'log', msg: `Army Assistant: Attacking ${target.id} (not waiting for completion)` })
  actions.automatedClicksPending++
  sendToAttackButton.click()
  await sleep(500)

  return { success: true, fight: target.id }
}

/**
 * Wait for both scouting and fighting to complete
 */
const waitForOperations = async () => {
  const MainStore = reactUtil.getGameData()
  if (!MainStore?.ArmyStore) {
    await sleep(5000)
    return
  }

  let waitCount = 0
  while (waitCount < 60) {
    const scoutInProgress = MainStore.ArmyStore.exploreInProgress
    const fightInProgress = MainStore.ArmyStore.attackInProgress

    if (!scoutInProgress && !fightInProgress) {
      logger({ msgLevel: 'debug', msg: `Army Assistant: Operations completed in ${waitCount * 0.5}s` })
      break
    }

    if (shouldStop) break
    await sleep(500)
    waitCount++
  }
}

/**
 * Main army assistant loop - runs scouting and fighting in parallel
 */
const autoScoutAndFight = async () => {
  shouldStop = false
  logger({ msgLevel: 'log', msg: 'Army Assistant: Starting auto scout + fight (parallel mode)' })

  try {
    let canScout = true
    let canFight = true

    while (!shouldStop && (canScout || canFight)) {
      let scoutStarted = false
      let fightStarted = false

      // Try to start scouting if still viable
      if (canScout) {
        const scoutingUnits = getTotalScoutingUnits()

        if (scoutingUnits.total < 10) {
          logger({ msgLevel: 'log', msg: `Army Assistant: Stopping scouting - only ${scoutingUnits.total} scouting units hired` })
          canScout = false
        } else {
          logger({
            msgLevel: 'debug',
            msg: `Army Assistant: Starting scout (${scoutingUnits.total} units available)`,
          })

          const result = await startScout()
          if (result.success) {
            scoutStarted = true
          } else {
            logger({ msgLevel: 'debug', msg: `Army Assistant: Scout failed: ${result.reason}` })
          }
        }
      }

      // Try to start fighting if still viable
      if (canFight) {
        logger({ msgLevel: 'debug', msg: 'Army Assistant: Starting fight' })

        const result = await startFight()
        if (result.success) {
          fightStarted = true
        } else {
          if (result.reason === 'unwinnable' || result.reason === 'all_unwinnable') {
            logger({ msgLevel: 'log', msg: 'Army Assistant: Stopping fights - no winnable enemies' })
            canFight = false
          } else {
            logger({ msgLevel: 'debug', msg: `Army Assistant: Fight failed: ${result.reason}` })
          }
        }
      }

      // If both are disabled, stop
      if (!canScout && !canFight) {
        logger({ msgLevel: 'log', msg: 'Army Assistant: Both scouting and fighting stopped' })
        break
      }

      // If at least one started, wait for operations to complete
      if (scoutStarted || fightStarted) {
        logger({ msgLevel: 'debug', msg: 'Army Assistant: Waiting for operations to complete...' })
        await waitForOperations()
      } else {
        // Neither started, wait a bit and try again
        await sleep(2000)
      }
    }

    logger({ msgLevel: 'log', msg: 'Army Assistant: Finished' })
    return { completed: true }
  } catch (e) {
    logger({ msgLevel: 'error', msg: `Army Assistant error: ${e.message}` })
    console.error(e)
    return { completed: false, error: e.message }
  } finally {
    shouldStop = false
  }
}

export default {
  autoScoutAndFight,
  stop,
}
