import { buildings } from './data'
import { CONSTANTS, navigation, selectors, logger, sleep, state, reactUtil, keyGen } from './utils'

// Buildings to never auto-build (strategic choices or negative effects)
const BLACKLIST = [
  'pillar_mana', // Negative gold production
  'statue_atamar', // Mutually exclusive with other statues
  'statue_firio',
  'statue_lurezia',
  'harvest_shrine', // Mutually exclusive with other shrines
  'war_shrine',
  'mind_shrine',
  'fate_shrine_b',
  'fate_shrine_f',
]

// Track user activity
let lastUserActivity = Date.now()
let lastAssistAction = 0

// Monitor user interactions
const initActivityMonitor = () => {
  if (typeof window !== 'undefined') {
    document.addEventListener('click', () => {
      lastUserActivity = Date.now()
    })

    document.addEventListener('keypress', () => {
      lastUserActivity = Date.now()
    })

    // Also watch for tab changes as user activity
    const observer = new MutationObserver(() => {
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')
      if (activeTab) {
        lastUserActivity = Date.now()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    })
  }
}

// Check if user is idle (60 seconds with no interaction)
const isUserIdle = () => {
  const idleTime = Date.now() - lastUserActivity
  const idleThreshold = state.options.assistMode?.idleSeconds ? state.options.assistMode.idleSeconds * 1000 : 60000
  return idleTime > idleThreshold
}

// Check if enough time has passed since last assist action (prevent spam)
const canAssist = () => {
  const timeSinceLastAction = Date.now() - lastAssistAction
  return timeSinceLastAction > 30000 // At least 30 seconds between assists
}

// Check if a building is blacklisted
const isBlacklisted = (buildingId) => {
  // Check static blacklist
  if (BLACKLIST.includes(buildingId)) {
    return true
  }

  // Check if building costs lucky stone
  const buildingData = buildings.find((b) => b.id === buildingId)
  if (buildingData && buildingData.req) {
    const costsLuckyStone = buildingData.req.some((req) => req.type === 'resource' && req.id === 'lucky_stone')
    if (costsLuckyStone) {
      return true
    }
  }

  return false
}

// Get resources that are at or above 90% capacity
const getResourcesAtCap = () => {
  const gameData = reactUtil.getGameData()
  if (!gameData || !gameData.resources) {
    return []
  }

  const cappedResources = []
  const threshold = 0.9 // 90% capacity

  Object.keys(gameData.resources).forEach((resourceId) => {
    const resource = gameData.resources[resourceId]
    if (resource && resource.capacity > 0) {
      const percentage = resource.amount / resource.capacity
      if (percentage >= threshold) {
        cappedResources.push({
          id: resourceId,
          amount: resource.amount,
          capacity: resource.capacity,
          percentage: percentage,
        })
      }
    }
  })

  return cappedResources
}

// Find buildings that consume a specific resource
const getBuildingsThatConsume = (resourceId) => {
  return buildings.filter((building) => {
    if (!building.req) return false

    // Check if building is blacklisted
    if (isBlacklisted(building.id)) {
      return false
    }

    // Check if building requires this resource
    return building.req.some((req) => req.type === 'resource' && req.id === resourceId)
  })
}

// Try to build something to spend capped resources
const tryBuildAtCap = async () => {
  const cappedResources = getResourcesAtCap()

  if (cappedResources.length === 0) {
    return false
  }

  logger({
    msgLevel: 'info',
    msg: `Assist Mode: Resources at cap: ${cappedResources.map((r) => r.id).join(', ')}`,
  })

  // Navigate to Build page if not already there
  const onBuildPage = navigation.checkPage(CONSTANTS.PAGES.BUILD)
  const originalPage = !onBuildPage

  if (!onBuildPage) {
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Build page' })
    await navigation.switchPage(CONSTANTS.PAGES.BUILD)
    await sleep(1000)
  }

  // Get all buildable buttons
  const buttons = selectors.getAllButtons(false)

  // Try to find a building we can build
  let built = false

  for (const resource of cappedResources) {
    const buildingsForResource = getBuildingsThatConsume(resource.id)

    for (const building of buildingsForResource) {
      const buildingKey = keyGen.building.key(building.id)

      // Find the button for this building
      const button = buttons.find((btn) => {
        const id = reactUtil.getNearestKey(btn, 6)
        return id === buildingKey && !btn.classList.toString().includes('btn-off')
      })

      if (button) {
        logger({
          msgLevel: 'info',
          msg: `Assist Mode: Building ${building.id} to spend ${resource.id}`,
        })

        button.click()
        built = true
        lastAssistAction = Date.now()
        await sleep(500)
        break
      }
    }

    if (built) break
  }

  return built
}

// Main assist mode loop
const assistLoop = async () => {
  // Only run if assist mode is enabled
  if (!state.options.assistMode?.enabled) {
    return
  }

  // Check if user is idle
  if (!isUserIdle()) {
    return
  }

  // Check if enough time has passed since last action
  if (!canAssist()) {
    return
  }

  // Try to build at cap
  try {
    await tryBuildAtCap()
  } catch (e) {
    logger({ msgLevel: 'error', msg: `Assist Mode error: ${e.message}` })
  }
}

// Initialize assist mode
const init = () => {
  // Set default options if not present
  if (!state.options.assistMode) {
    state.options.assistMode = {
      enabled: true,
      idleSeconds: 60,
    }
  }

  initActivityMonitor()

  // Run assist loop every 10 seconds
  setInterval(assistLoop, 10000)

  logger({ msgLevel: 'log', msg: 'Assist Mode initialized' })
}

export default { init, isUserIdle, getResourcesAtCap }
