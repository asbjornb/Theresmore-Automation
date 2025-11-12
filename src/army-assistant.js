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
 * Execute one scouting mission
 */
const doScout = async () => {
  logger({ msgLevel: 'debug', msg: 'Army Assistant: Executing scout mission' })

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

  logger({ msgLevel: 'log', msg: 'Army Assistant: Sending scouting mission' })
  actions.automatedClicksPending++
  sendButton.click()

  // Wait for explore to complete
  const MainStore = reactUtil.getGameData()
  if (MainStore?.ArmyStore) {
    let waitCount = 0
    while (MainStore.ArmyStore.exploreInProgress && waitCount < 60) {
      await sleep(500)
      waitCount++
      if (shouldStop) break
    }
    logger({ msgLevel: 'debug', msg: `Army Assistant: Explore completed in ${waitCount * 0.5}s` })
  } else {
    await sleep(5000) // Default wait if we can't access ArmyStore
  }

  return { success: true }
}

/**
 * Execute one fight - based on original army-attack.js logic
 */
const doFight = async () => {
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

  // Find first winnable fight using armyCalculator
  let target = null
  for (const enemy of enemyList) {
    if (shouldStop) break
    const canWin = armyCalculator.canWinBattle(enemy.key, false, false, false)
    if (canWin) {
      target = enemy
      break
    }
  }

  if (!target) {
    logger({ msgLevel: 'log', msg: 'Army Assistant: No winnable fights found' })
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

  // Attack
  if (!sendToAttackButton || sendToAttackButton.disabled) {
    logger({ msgLevel: 'error', msg: 'Army Assistant: Attack button not available' })
    return { success: false, reason: 'no_attack_button' }
  }

  logger({ msgLevel: 'log', msg: `Army Assistant: Attacking ${target.id}` })
  actions.automatedClicksPending++
  sendToAttackButton.click()

  // Wait for attack to complete
  const MainStore = reactUtil.getGameData()
  if (MainStore?.ArmyStore) {
    let waitCount = 0
    while (MainStore.ArmyStore.attackInProgress && waitCount < 60) {
      await sleep(500)
      waitCount++
      if (shouldStop) break
    }
    logger({ msgLevel: 'debug', msg: `Army Assistant: Attack completed in ${waitCount * 0.5}s` })
  } else {
    await sleep(5000) // Default wait if we can't access ArmyStore
  }

  return { success: true, fight: target.id }
}

/**
 * Main army assistant loop - alternates between scouting and fighting
 */
const autoScoutAndFight = async () => {
  shouldStop = false
  logger({ msgLevel: 'log', msg: 'Army Assistant: Starting auto scout + fight' })

  try {
    let scoutNext = true // Start with scouting
    let consecutiveFailures = 0

    while (!shouldStop && consecutiveFailures < 3) {
      // Check total hired scouting units
      const scoutingUnits = getTotalScoutingUnits()

      if (scoutingUnits.total < 10) {
        logger({ msgLevel: 'log', msg: `Army Assistant: Stopping - only ${scoutingUnits.total} scouting units hired` })
        break
      }

      logger({
        msgLevel: 'debug',
        msg: `Army Assistant: Total hired scouting units: ${scoutingUnits.scouts} scouts, ${scoutingUnits.explorers} explorers, ${scoutingUnits.familiars} familiars (total: ${scoutingUnits.total})`,
      })

      // Alternate between scouting and fighting
      if (scoutNext) {
        const result = await doScout()

        if (!result.success) {
          if (result.reason === 'no_button') {
            logger({ msgLevel: 'log', msg: 'Army Assistant: Cannot scout (insufficient resources or units)' })
            consecutiveFailures++
          }
          // Try fighting instead
          scoutNext = false
        } else {
          consecutiveFailures = 0
          scoutNext = false // Switch to fighting
        }
      } else {
        const result = await doFight()

        if (!result.success) {
          if (result.reason === 'unwinnable' || result.reason === 'all_unwinnable') {
            logger({ msgLevel: 'log', msg: 'Army Assistant: Stopping - encountered unwinnable fight' })
            break
          }
          if (result.reason === 'no_attack_button') {
            logger({ msgLevel: 'log', msg: 'Army Assistant: Cannot fight (insufficient resources or army)' })
            consecutiveFailures++
          }
          // Try scouting instead
          scoutNext = true
        } else {
          consecutiveFailures = 0
          scoutNext = true // Switch to scouting
        }
      }
    }

    if (consecutiveFailures >= 3) {
      logger({ msgLevel: 'log', msg: 'Army Assistant: Stopping - out of resources or units' })
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
