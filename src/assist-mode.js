import { buildings, tech } from './data'
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

// Research to never auto-research (triggers dangerous fights or resets)
const UNSAFE_RESEARCH = [
  'kobold_nation', // Triggers dangerous fight
  'barbarian_tribes', // Triggers dangerous fight
  'orcish_threat', // Triggers dangerous fight
  'huge_cave_t', // Triggers dangerous fight
  'mindless_evil', // Triggers dangerous fight
  'moonlight_night', // Triggers fight
  'dragon_assault', // Triggers fight
  'mysterious_robbery', // Triggers fight
  'fallen_angel', // Triggers fight
  'orc_horde', // Triggers fight
  'launch_annhilator', // Resets the game
]

// Track user activity
let lastUserActivity = Date.now()
let lastBuildAction = 0
let lastResearchAction = 0
let lastPrayerAction = 0
let lastActiveTab = null
let assistModeIsActing = false // Flag to ignore all assist mode actions (clicks, navigation, etc.)

// Cooldown timings
const BUILD_COOLDOWN = 5000 // 5 seconds between builds
const RESEARCH_COOLDOWN = 120000 // 2 minutes between research checks
const PRAYER_COOLDOWN = 120000 // 2 minutes between prayer checks

// Monitor user interactions
const initActivityMonitor = () => {
  if (typeof window !== 'undefined') {
    // Reset idle timer on user clicks (but not assist mode's actions)
    document.addEventListener('click', () => {
      if (assistModeIsActing) {
        return // Ignore assist mode's own clicks
      }
      lastUserActivity = Date.now()
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Activity detected (click)' })
    })

    // Reset idle timer on keypresses
    document.addEventListener('keypress', () => {
      if (assistModeIsActing) {
        return // Ignore assist mode's own keypresses (if any)
      }
      lastUserActivity = Date.now()
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Activity detected (keypress)' })
    })

    // Watch for tab changes as user activity (but only ACTUAL user changes, not assist mode)
    const tabContainer = document.querySelector('#maintabs-container [role="tablist"]')
    if (tabContainer) {
      const observer = new MutationObserver(() => {
        if (assistModeIsActing) {
          return // Ignore assist mode's navigation
        }

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

// Check if enough time has passed since last build action (prevent spam)
const canBuild = () => {
  const timeSinceLastAction = Date.now() - lastBuildAction
  return timeSinceLastAction > BUILD_COOLDOWN
}

// Check if enough time has passed since last research action
const canResearch = () => {
  const timeSinceLastAction = Date.now() - lastResearchAction
  return timeSinceLastAction > RESEARCH_COOLDOWN
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
  // Find food resource row in DOM
  const resourceRows = document.querySelectorAll('#root div > div > div > table > tbody > tr')
  let currentFoodProduction = 0

  for (const row of resourceRows) {
    try {
      const firstCell = row.childNodes[0]?.querySelector('span')
      if (!firstCell) continue

      const key = reactUtil.getNearestKey(firstCell, 6)
      const resourceId = keyGen.resource.id(key)

      if (resourceId === 'food') {
        // Parse production rate from third cell (format: "+5.2/s" or "-1.0/s")
        const speedText = row.childNodes[2]?.textContent.trim() || '0'
        currentFoodProduction = parseFloat(speedText.replace(/[^0-9.\-]/g, '')) || 0
        break
      }
    } catch (e) {
      continue
    }
  }

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
  const cappedResources = []
  const threshold = 0.9 // 90% capacity
  const allResources = []

  // Query all resource rows once (much faster than individual queries)
  const resourceRows = document.querySelectorAll('#root div > div > div > table > tbody > tr')

  resourceRows.forEach((row) => {
    try {
      const cells = row.childNodes
      if (!cells || cells.length < 3) return

      // Get resource ID from React key
      const firstCell = cells[0].querySelector('span')
      if (!firstCell) return

      const key = reactUtil.getNearestKey(firstCell, 6)
      if (!key) return

      const resourceId = keyGen.resource.id(key)
      if (!resourceId) return

      // Parse current/max from second cell (format: "1000/1000")
      const valuesText = cells[1].textContent.trim()
      const values = valuesText.split('/').map((x) => parseFloat(x.replace(/[^0-9.\-]/g, '')))

      if (values.length !== 2) return

      const current = values[0]
      const max = values[1]

      if (!max || max <= 0) return

      const percentage = current / max
      allResources.push(`${resourceId}:${Math.round(percentage * 100)}%`)

      if (percentage >= threshold) {
        cappedResources.push({
          id: resourceId,
          amount: current,
          capacity: max,
          percentage: percentage,
        })
      }
    } catch (e) {
      // Skip malformed rows
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

// Find research that consumes capped resources (safe research only)
const getResearchThatConsumes = (resourceIds) => {
  return tech.filter((research) => {
    if (!research.req) return false

    // Skip unsafe research (triggers fights or resets)
    if (UNSAFE_RESEARCH.includes(research.id)) {
      return false
    }

    // Skip research with confirmation dialogs (usually mutually exclusive choices)
    if (research.confirm) {
      return false
    }

    // Check if research requires any of the capped resources
    return research.req.some((req) => req.type === 'resource' && resourceIds.includes(req.id))
  })
}

// Try to research something to spend capped resources
const tryResearchAtCap = async () => {
  const cappedResources = getResourcesAtCap()

  if (cappedResources.length === 0) {
    return { researched: false, reason: 'no_resources_at_cap' }
  }

  const cappedResourceIds = cappedResources.map((r) => r.id)

  logger({
    msgLevel: 'debug',
    msg: `Assist Mode: Checking research for capped resources: ${cappedResourceIds.join(', ')}`,
  })

  // Set flag to ignore all automated actions
  assistModeIsActing = true

  try {
    // Navigate to Research page if not already there
    const onResearchPage = navigation.checkPage(CONSTANTS.PAGES.RESEARCH)

    if (!onResearchPage) {
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Research page' })
      await navigation.switchPage(CONSTANTS.PAGES.RESEARCH)
      await sleep(1000)
    }

    // Get all research buttons
    const buttons = selectors.getAllButtons(true)

    // Find research that uses capped resources
    const researchOptions = getResearchThatConsumes(cappedResourceIds)

    for (const research of researchOptions) {
      const researchKey = keyGen.research.key(research.id)

      // Find the button for this research
      const button = buttons.find((btn) => {
        const id = reactUtil.getNearestKey(btn, 7)
        return id === researchKey && !btn.classList.toString().includes('btn-off')
      })

      if (button) {
        // Find which capped resource this research uses
        const usedResource = research.req.find((req) => req.type === 'resource' && cappedResourceIds.includes(req.id))

        logger({
          msgLevel: 'info',
          msg: `Assist Mode: Researching ${research.id} to spend ${usedResource.id}`,
        })

        button.click()
        lastResearchAction = Date.now()
        await sleep(500)

        // Navigate back to Build page
        await navigation.switchPage(CONSTANTS.PAGES.BUILD)
        await sleep(500)

        return { researched: true, research: research.id, resource: usedResource.id }
      }
    }

    // Navigate back to Build page
    await navigation.switchPage(CONSTANTS.PAGES.BUILD)
    await sleep(500)

    return { researched: false, reason: 'no_affordable_research' }
  } finally {
    // Always clear the flag
    assistModeIsActing = false
  }
}

// Try to build something to spend capped resources
const tryBuildAtCap = async () => {
  const cappedResources = getResourcesAtCap()

  if (cappedResources.length === 0) {
    return { built: false, reason: 'no_resources_at_cap' }
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
  for (const resource of cappedResources) {
    const buildingsForResource = getBuildingsThatConsume(resource.id)

    if (buildingsForResource.length === 0) {
      logger({
        msgLevel: 'debug',
        msg: `Assist Mode: No safe buildings found for ${resource.id}`,
      })
      continue
    }

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
        assistModeIsActing = true
        button.click()
        assistModeIsActing = false

        lastBuildAction = Date.now()
        await sleep(500)
        return { built: true, building: building.id, resource: resource.id }
      }
    }
  }

  return { built: false, reason: 'no_safe_buildings' }
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

  // Try research if cooldown has passed (every 3 minutes)
  if (canResearch()) {
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Checking for research opportunities...' })
    try {
      const researchResult = await tryResearchAtCap()
      if (!researchResult.researched) {
        if (researchResult.reason === 'no_affordable_research') {
          logger({ msgLevel: 'debug', msg: 'Assist Mode: No affordable research for capped resources' })
        }
      }
    } catch (e) {
      logger({ msgLevel: 'error', msg: `Assist Mode research error: ${e.message}` })
      console.error(e)
    }
  }

  // Try building if cooldown has passed (every 5 seconds)
  if (canBuild()) {
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Checking for building opportunities...' })
    try {
      const buildResult = await tryBuildAtCap()
      if (!buildResult.built) {
        if (buildResult.reason === 'no_safe_buildings') {
          logger({ msgLevel: 'debug', msg: 'Assist Mode: Resources at cap but no safe/affordable buildings available' })
        }
      }
    } catch (e) {
      logger({ msgLevel: 'error', msg: `Assist Mode build error: ${e.message}` })
      console.error(e)
    }
  } else {
    const timeSince = Math.floor((Date.now() - lastBuildAction) / 1000)
    const cooldown = Math.floor(BUILD_COOLDOWN / 1000)
    logger({ msgLevel: 'debug', msg: `Assist Mode: Build cooldown active (${timeSince}s / ${cooldown}s)` })
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
