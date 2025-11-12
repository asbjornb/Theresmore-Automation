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
import { CONSTANTS, navigation, logger, sleep, state, reactUtil, keyGen, resources, selectors } from './utils'
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
 * Get available scouting units
 */
const getScoutingUnits = () => {
  try {
    const scoutData = resources.get('scout')
    const explorerData = resources.get('explorer')
    const familiarData = resources.get('familiar')

    return {
      scouts: scoutData?.current || 0,
      explorers: explorerData?.current || 0,
      familiars: familiarData?.current || 0,
      total: (scoutData?.current || 0) + (explorerData?.current || 0) + (familiarData?.current || 0),
    }
  } catch (e) {
    logger({ msgLevel: 'error', msg: `Army Assistant: Error getting scouting units: ${e.message}` })
    return { scouts: 0, explorers: 0, familiars: 0, total: 0 }
  }
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

  // Find and click the blue "Send to Explore" button
  const sendButton = container.querySelector('button.btn-blue:not(.btn-off):not(.btn-off-cap)')
  if (!sendButton) {
    logger({ msgLevel: 'debug', msg: 'Army Assistant: No explore button available (insufficient resources or units)' })
    return { success: false, reason: 'no_button' }
  }

  logger({ msgLevel: 'log', msg: 'Army Assistant: Sending scouting mission' })
  actions.automatedClicksPending++
  sendButton.click()
  await sleep(1000)

  return { success: true }
}

/**
 * Get available fights with skull count
 */
const getAvailableFights = () => {
  const container = document.querySelector('div.tab-container.sub-container')
  if (!container) return []

  const controlBox = container.querySelector('div.grid > div.flex')
  if (!controlBox) return []

  // Get fight list
  const fightElements = [...container.querySelectorAll('div.grid > div.flex')].slice(1)

  const fights = fightElements
    .map((element) => {
      try {
        // Find skull indicators (difficulty)
        const skulls = element.querySelectorAll('svg[data-icon="skull"]')
        const difficulty = skulls.length

        // Get fight key from React
        const key = reactUtil.getNearestKey(element, 2)

        // Find fight data
        const fightData = [...factions, ...locations].find((f) => keyGen.enemy.key(f.id) === key)

        if (!fightData) return null

        // Skip blacklisted fights
        if (FIGHT_BLACKLIST.includes(fightData.id)) {
          logger({ msgLevel: 'debug', msg: `Army Assistant: Skipping blacklisted fight ${fightData.id}` })
          return null
        }

        return {
          element,
          key,
          id: fightData.id,
          difficulty,
          level: fightData.level || 0,
        }
      } catch (e) {
        return null
      }
    })
    .filter((f) => f !== null)

  // Sort by difficulty (easiest first)
  fights.sort((a, b) => a.difficulty - b.difficulty || a.level - b.level)

  return fights
}

/**
 * Consult oracle for a fight
 */
const consultOracle = async (fight) => {
  logger({ msgLevel: 'debug', msg: `Army Assistant: Consulting oracle for ${fight.id}` })

  // Find oracle button
  const container = document.querySelector('div.tab-container.sub-container')
  if (!container) return { winnable: false, reason: 'no_container' }

  const buttons = [...container.querySelectorAll('button.btn')]
  const oracleButton = buttons.find((btn) => {
    const index = reactUtil.getBtnIndex(btn, 2)
    return index === 2 // Oracle is typically button index 2
  })

  if (!oracleButton || oracleButton.disabled) {
    logger({ msgLevel: 'debug', msg: 'Army Assistant: Oracle not available' })
    return { winnable: false, reason: 'no_oracle' }
  }

  actions.automatedClicksPending++
  oracleButton.click()
  await sleep(1500)

  // Check for oracle result modal
  const modal = document.querySelector('div.modal')
  if (!modal) {
    logger({ msgLevel: 'debug', msg: 'Army Assistant: Oracle modal not found' })
    return { winnable: false, reason: 'no_modal' }
  }

  // Look for win/loss indicators
  const modalText = modal.textContent.toLowerCase()
  const winnable = modalText.includes('win') || modalText.includes('victory') || !modalText.includes('loss')

  // Close modal
  const closeButton = modal.querySelector('button')
  if (closeButton) {
    actions.automatedClicksPending++
    closeButton.click()
    await sleep(500)
  }

  logger({ msgLevel: 'log', msg: `Army Assistant: Oracle says ${fight.id} is ${winnable ? 'WINNABLE' : 'UNWINNABLE'}` })
  return { winnable, checked: true }
}

/**
 * Execute one fight
 */
const doFight = async () => {
  logger({ msgLevel: 'debug', msg: 'Army Assistant: Looking for fights' })

  // Navigate to Army > Attack
  await navigation.switchPage(CONSTANTS.PAGES.ARMY)
  await sleep(500)
  await navigation.switchSubPage(CONSTANTS.SUBPAGES.ATTACK, CONSTANTS.PAGES.ARMY)
  await sleep(1000)

  const fights = getAvailableFights()

  if (fights.length === 0) {
    logger({ msgLevel: 'debug', msg: 'Army Assistant: No fights available' })
    return { success: false, reason: 'no_fights' }
  }

  // Try fights from easiest to hardest
  for (const fight of fights) {
    if (shouldStop) break

    logger({ msgLevel: 'debug', msg: `Army Assistant: Considering ${fight.id} (${fight.difficulty} skulls)` })

    // Consult oracle
    const oracleResult = await consultOracle(fight)

    if (!oracleResult.winnable) {
      logger({ msgLevel: 'log', msg: `Army Assistant: Skipping unwinnable fight ${fight.id}` })
      return { success: false, reason: 'unwinnable', fight: fight.id }
    }

    // Fight is winnable - execute it
    logger({ msgLevel: 'log', msg: `Army Assistant: Fighting ${fight.id} (${fight.difficulty} skulls)` })

    const container = document.querySelector('div.tab-container.sub-container')
    if (!container) return { success: false, reason: 'no_container' }

    const attackButton = [...container.querySelectorAll('button.btn')].find((btn) => reactUtil.getBtnIndex(btn, 0) === 3)

    if (!attackButton || attackButton.disabled) {
      logger({ msgLevel: 'debug', msg: 'Army Assistant: Attack button not available' })
      return { success: false, reason: 'no_attack_button' }
    }

    actions.automatedClicksPending++
    attackButton.click()
    await sleep(2000) // Wait for fight to process

    return { success: true, fight: fight.id }
  }

  return { success: false, reason: 'all_unwinnable' }
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
      // Check scouting units
      const scoutingUnits = getScoutingUnits()

      if (scoutingUnits.total < 10) {
        logger({ msgLevel: 'log', msg: `Army Assistant: Stopping - only ${scoutingUnits.total} scouting units left` })
        break
      }

      logger({
        msgLevel: 'debug',
        msg: `Army Assistant: Scouting units available: ${scoutingUnits.scouts} scouts, ${scoutingUnits.explorers} explorers, ${scoutingUnits.familiars} familiars (total: ${scoutingUnits.total})`,
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

      // Small delay between actions
      await sleep(500)
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

/**
 * Inject the Auto Scout & Fight button into the Army > Attack page
 */
let isRunning = false
const injectButton = () => {
  // Only inject on Army > Attack page
  const currentPage = document.querySelector('button.btn-gold[disabled]')
  if (!currentPage || !currentPage.textContent.includes('Army')) return

  const attackTab = [...document.querySelectorAll('button.btn-sm')].find((btn) => btn.textContent.includes('Attack'))
  if (!attackTab || !attackTab.disabled) return

  // Check if button already exists
  if (document.querySelector('.taArmyAssistantButton')) return

  // Find the container to inject into
  const container = document.querySelector('div.tab-container.sub-container')
  if (!container) return

  // Create button container
  const buttonContainer = document.createElement('div')
  buttonContainer.className = 'taArmyAssistantButton mb-2 mt-2'
  buttonContainer.innerHTML = `
    <button type="button" class="btn btn-blue taArmyAssistantBtn" style="width: 100%;">
      🗡️ Auto Scout & Fight
    </button>
    <div class="text-xs mt-1 text-gray-400">
      Scouts then fights (easiest first). Consults oracle. Stops on unwinnable fights.
    </div>
  `

  // Insert at top of container
  container.insertBefore(buttonContainer, container.firstChild)

  // Add click handler
  const button = buttonContainer.querySelector('.taArmyAssistantBtn')
  button.addEventListener('click', async () => {
    if (isRunning) {
      stop()
      return
    }

    isRunning = true
    button.disabled = true
    button.textContent = '⏸️ Running... (click to stop)'
    button.classList.remove('btn-blue')
    button.classList.add('btn-orange')

    try {
      await autoScoutAndFight()
    } finally {
      isRunning = false
      button.disabled = false
      button.textContent = '🗡️ Auto Scout & Fight'
      button.classList.remove('btn-orange')
      button.classList.add('btn-blue')
    }
  })

  logger({ msgLevel: 'debug', msg: 'Army Assistant: Button injected into Attack page' })
}

export default {
  autoScoutAndFight,
  stop,
  injectButton,
}
