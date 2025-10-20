import { buildings } from './data'
import { CONSTANTS, navigation, selectors, logger, sleep, state, reactUtil, keyGen, resources } from './utils'

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
let lastActiveTab = null
let assistModeIsClicking = false // Flag to ignore assist mode's own clicks

// Monitor user interactions
const initActivityMonitor = () => {
  if (typeof window !== 'undefined') {
    // Reset idle timer on user clicks (but not assist mode's clicks)
    document.addEventListener('click', () => {
      if (assistModeIsClicking) {
        return // Ignore assist mode's own clicks
      }
      lastUserActivity = Date.now()
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Activity detected (click)' })
    })

    // Reset idle timer on keypresses
    document.addEventListener('keypress', () => {
      lastUserActivity = Date.now()
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Activity detected (keypress)' })
    })

    // Watch for tab changes as user activity (but only ACTUAL changes)
    const tabContainer = document.querySelector('#maintabs-container [role="tablist"]')
    if (tabContainer) {
      const observer = new MutationObserver(() => {
        const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')
        if (activeTab) {
          const currentTab = activeTab.textContent
          // Only reset if tab actually changed
          if (lastActiveTab && lastActiveTab !== currentTab) {
            lastUserActivity = Date.now()
            logger({ msgLevel: 'debug', msg: `Assist Mode: Activity detected (tab change to ${currentTab})` })
          }
          lastActiveTab = currentTab
        }
      })

      observer.observe(tabContainer, {
        attributes: true,
        attributeFilter: ['aria-selected'],
        subtree: true,
      })
    }
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

// Check if building has negative non-food production
const hasNegativeNonFoodProduction = (building) => {
  if (!building.gen) return false

  return building.gen.some((gen) => {
    return gen.type === 'resource' && gen.id !== 'food' && gen.value < 0
  })
}

// Check if building would make food production go negative
const isFoodSafe = (building) => {
  // Get current food data from DOM
  const foodData = resources.get('food')
  if (!foodData) {
    return false
  }

  // Get current food production rate (speed is per second)
  const currentFoodProduction = foodData.speed || 0

  // Find food cost in building's gen
  let foodCost = 0
  if (building.gen) {
    const foodGen = building.gen.find((gen) => gen.type === 'resource' && gen.id === 'food')
    if (foodGen) {
      foodCost = foodGen.value
    }
  }

  // If building would make total food production negative, it's not safe
  return currentFoodProduction + foodCost >= 0
}

// Calculate total cost of a building (sum of all resource requirements)
const calculateBuildingCost = (building) => {
  if (!building.req) return 0

  return building.req.reduce((sum, req) => {
    if (req.type === 'resource') {
      return sum + (req.value || 0)
    }
    return sum
  }, 0)
}

// Get resources that are at or above 90% capacity
const getResourcesAtCap = () => {
  const gameData = reactUtil.getGameData()

  if (!gameData || !gameData.ResourcesStore || !gameData.ResourcesStore.resources) {
    logger({ msgLevel: 'debug', msg: 'Assist Mode: No ResourcesStore.resources found' })
    return []
  }

  const resourceMetadata = gameData.ResourcesStore.resources
  const cappedResources = []
  const threshold = 0.9 // 90% capacity
  const allResources = []

  // Use the existing resources.get() utility which parses from DOM
  resourceMetadata.forEach((resourceMeta) => {
    if (!resourceMeta || !resourceMeta.id) return

    // Get actual current values from DOM using existing utility
    const resourceData = resources.get(resourceMeta.id)

    if (!resourceData || !resourceData.max || resourceData.max <= 0) {
      return
    }

    const percentage = resourceData.current / resourceData.max
    allResources.push(`${resourceMeta.id}:${Math.round(percentage * 100)}%`)

    if (percentage >= threshold) {
      cappedResources.push({
        id: resourceMeta.id,
        amount: resourceData.current,
        capacity: resourceData.max,
        percentage: percentage,
      })
    }
  })

  logger({ msgLevel: 'debug', msg: `Assist Mode: All resources: ${allResources.join(', ')}` })
  logger({
    msgLevel: 'debug',
    msg: `Assist Mode: Resources at cap (≥90%): ${cappedResources.map((r) => r.id).join(', ') || 'none'}`,
  })

  return cappedResources
}

// Find buildings that consume a specific resource (with safety checks and sorted by cost)
const getBuildingsThatConsume = (resourceId) => {
  return buildings
    .filter((building) => {
      if (!building.req) return false

      // Check if building is blacklisted
      if (isBlacklisted(building.id)) {
        return false
      }

      // Check for negative non-food production (like Pillars with -gold)
      if (hasNegativeNonFoodProduction(building)) {
        return false
      }

      // Check if building would make food production negative
      if (!isFoodSafe(building)) {
        return false
      }

      // Check if building requires this resource
      return building.req.some((req) => req.type === 'resource' && req.id === resourceId)
    })
    .sort((a, b) => {
      // Sort by total cost (cheapest first)
      return calculateBuildingCost(a) - calculateBuildingCost(b)
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
        const cost = calculateBuildingCost(building)
        logger({
          msgLevel: 'info',
          msg: `Assist Mode: Building ${building.id} (cost: ${cost}) to spend ${resource.id} (${Math.round(resource.percentage * 100)}% full)`,
        })

        // Set flag before clicking to prevent resetting idle timer
        assistModeIsClicking = true
        button.click()
        assistModeIsClicking = false

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
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Not enabled' })
    return
  }

  // Check if user is idle
  if (!isUserIdle()) {
    const idleTime = Math.floor((Date.now() - lastUserActivity) / 1000)
    logger({ msgLevel: 'debug', msg: `Assist Mode: User not idle yet (${idleTime}s / 60s)` })
    return
  }

  // Check if enough time has passed since last action
  if (!canAssist()) {
    const timeSince = Math.floor((Date.now() - lastAssistAction) / 1000)
    logger({ msgLevel: 'debug', msg: `Assist Mode: Cooldown active (${timeSince}s / 30s)` })
    return
  }

  // Try to build at cap
  logger({ msgLevel: 'debug', msg: 'Assist Mode: Checking for resources at cap...' })
  try {
    const built = await tryBuildAtCap()
    if (!built) {
      logger({ msgLevel: 'debug', msg: 'Assist Mode: No resources at cap or no safe buildings to build' })
    }
  } catch (e) {
    logger({ msgLevel: 'error', msg: `Assist Mode error: ${e.message}` })
    console.error(e)
  }
}

// Initialize assist mode
const init = () => {
  // Set default options if not present
  if (!state.options.assistMode) {
    state.options.assistMode = {
      enabled: false,
      idleSeconds: 60,
    }
  }

  initActivityMonitor()

  // Run assist loop every 10 seconds
  setInterval(assistLoop, 10000)

  logger({
    msgLevel: 'log',
    msg: `Assist Mode initialized (${state.options.assistMode.enabled ? 'enabled' : 'disabled'})`,
  })
}

export default { init, isUserIdle, getResourcesAtCap }
