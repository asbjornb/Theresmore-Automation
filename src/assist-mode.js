import { buildings, tech, spells } from './data'
import { CONSTANTS, navigation, selectors, logger, sleep, state, reactUtil, keyGen, resources } from './utils'
import actions from './assist-mode-actions'

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

// Cooldown timings and tracking
let lastBuildAction = 0
let lastMagicCheckAction = 0 // Shared timer for research + prayers
let recentlyFailedSubpages = [] // Track subpages where we couldn't find affordable buildings

const BUILD_COOLDOWN = 5000 // 5 seconds between builds
const MAGIC_CHECK_COOLDOWN = 120000 // 2 minutes between research/prayer checks

// Check if enough time has passed since last build action (prevent spam)
const canBuild = () => {
  const timeSinceLastAction = Date.now() - lastBuildAction
  return timeSinceLastAction > BUILD_COOLDOWN
}

// Check if enough time has passed since last magic check (research + prayers)
const canCheckMagic = () => {
  const timeSinceLastAction = Date.now() - lastMagicCheckAction
  return timeSinceLastAction > MAGIC_CHECK_COOLDOWN
}

// Check if a building is blacklisted
const isBlacklisted = (buildingId) => {
  // Check static blacklist
  if (BLACKLIST.includes(buildingId)) {
    return true
  }

  // Check if building costs luck (lucky stones) or light
  const buildingData = buildings.find((b) => b.id === buildingId)
  if (buildingData && buildingData.req) {
    const costsLuckOrLight = buildingData.req.some((req) => req.type === 'resource' && (req.id === 'luck' || req.id === 'light'))
    if (costsLuckOrLight) {
      return true
    }
  }

  return false
}

// Check if building has negative non-food production
const hasNegativeNonFoodProduction = (building) => {
  // Colony Hall is allowed despite negative gold production
  if (building.id === 'colony_hall') {
    return false
  }

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

  // Buildings with negative food (housing) require current production to be higher than the cost
  // This prevents food production from ever going negative
  if (foodCost < 0) {
    const wouldBePositive = currentFoodProduction > Math.abs(foodCost)
    return wouldBePositive
  }

  // Buildings with positive or zero food impact are always safe
  return true
}

// Get resources that are at or above 90% capacity
const getResourcesAtCap = () => {
  const cappedResources = []
  const threshold = 0.9 // 90% capacity
  const allResources = []

  // Use the existing resources.get() utility which parses DOM correctly
  // Try to get each known resource
  const resourcesToCheck = [
    'gold',
    'food',
    'wood',
    'stone',
    'copper',
    'iron',
    'tools',
    'cow',
    'horse',
    'research',
    'faith',
    'mana',
    'building_material',
    'steel',
    'crystal',
    'supplies',
  ]

  let foundCount = 0
  let nullCount = 0

  resourcesToCheck.forEach((resourceId) => {
    try {
      const resourceData = resources.get(resourceId)
      if (!resourceData) {
        nullCount++
        return
      }

      foundCount++
      const current = resourceData.current || 0
      const max = resourceData.max || 0

      logger({
        msgLevel: 'debug',
        msg: `Assist Mode: ${resourceId}: ${current}/${max} (${Math.round((current / max) * 100)}%)`,
      })

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
      logger({ msgLevel: 'error', msg: `Assist Mode: Error checking ${resourceId}: ${e.message}` })
    }
  })

  logger({ msgLevel: 'debug', msg: `Assist Mode: Found ${foundCount} resources, ${nullCount} returned null` })

  logger({ msgLevel: 'debug', msg: `Assist Mode: All resources: ${allResources.join(', ')}` })
  logger({
    msgLevel: 'debug',
    msg: `Assist Mode: Resources at cap (≥90%): ${cappedResources.map((r) => r.id).join(', ') || 'none'}`,
  })

  return cappedResources
}

// Find buildings that consume a specific resource (with safety checks)
const getBuildingsThatConsume = (resourceId) => {
  const candidates = buildings.filter((building) => {
    if (!building.req) return false

    // Check if building requires this resource first
    const requiresResource = building.req.some((req) => req.type === 'resource' && req.id === resourceId)
    if (!requiresResource) return false

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

    return true
  })

  return candidates
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

// Check if a prayer is mutually exclusive (blocks other prayers)
const isMutuallyExclusivePrayer = (prayer) => {
  if (!prayer.gen) return false

  // Check if this prayer has a gen entry that blocks another prayer (value === -1)
  return prayer.gen.some((gen) => gen.value === -1 && gen.type !== 'resource')
}

// Find prayers that consume capped resources (safe prayers only)
const getPrayersThatConsume = (resourceIds) => {
  return spells.filter((spell) => {
    if (spell.type !== 'prayer') return false
    if (!spell.req) return false

    // Skip mutually exclusive prayers (player should choose these manually)
    if (isMutuallyExclusivePrayer(spell)) {
      return false
    }

    // Check if prayer requires any of the capped resources
    return spell.req.some((req) => req.type === 'resource' && resourceIds.includes(req.id))
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

  // Execute all navigation/clicking as automated actions
  return actions.executeAction(async () => {
    // Navigate to Research page if not already there
    const onResearchPage = navigation.checkPage(CONSTANTS.PAGES.RESEARCH)

    if (!onResearchPage) {
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Research page' })
      actions.automatedClicksPending++ // switchPage will click a tab
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
          msgLevel: 'log',
          msg: `Assist Mode: Researching ${research.id} to spend ${usedResource.id}`,
        })

        actions.automatedClicksPending++
        button.click()
        await sleep(500)

        // Navigate back to Build page
        actions.automatedClicksPending++ // switchPage will click a tab
        await navigation.switchPage(CONSTANTS.PAGES.BUILD)
        await sleep(500)

        return { researched: true, research: research.id, resource: usedResource.id }
      }
    }

    // Navigate back to Build page
    actions.automatedClicksPending++ // switchPage will click a tab
    await navigation.switchPage(CONSTANTS.PAGES.BUILD)
    await sleep(500)

    return { researched: false, reason: 'no_affordable_research' }
  })
}

// Check spell status (how many are active)
const checkSpellStatus = async () => {
  logger({ msgLevel: 'debug', msg: 'Assist Mode: Checking spell status' })

  // Execute all navigation/clicking as automated actions
  return actions.executeAction(async () => {
    // Navigate to Magic page if not already there
    const onMagicPage = navigation.checkPage(CONSTANTS.PAGES.MAGIC)

    if (!onMagicPage) {
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Magic page for spell check' })
      actions.automatedClicksPending++
      await navigation.switchPage(CONSTANTS.PAGES.MAGIC)
      await sleep(1000)
    }

    // Navigate to Spells subpage
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Spells subpage' })
    actions.automatedClicksPending++
    await navigation.switchSubPage(CONSTANTS.SUBPAGES.SPELLS, CONSTANTS.PAGES.MAGIC)
    await sleep(1000)

    // Count cast and dismiss buttons
    const allButtons = selectors.getAllButtons(true)
    const castButtons = allButtons.filter((btn) => btn.textContent === 'Cast this spell')
    const dismissButtons = allButtons.filter((btn) => btn.textContent === 'Dismiss this spell')

    const totalSpells = castButtons.length + dismissButtons.length
    const activeSpells = dismissButtons.length

    logger({
      msgLevel: 'debug',
      msg: `Assist Mode: Spell status - ${activeSpells}/${totalSpells} active`,
    })

    // Store in state for panel display
    state.spellStatus = {
      active: activeSpells,
      total: totalSpells,
      lastChecked: Date.now(),
    }

    // Navigate back to Build page
    actions.automatedClicksPending++
    await navigation.switchPage(CONSTANTS.PAGES.BUILD)
    await sleep(500)

    return { active: activeSpells, total: totalSpells }
  })
}

// Cast all spells (turn all on)
const castAllSpells = async () => {
  logger({ msgLevel: 'log', msg: 'Assist Mode: Casting all spells' })

  return actions.executeAction(async () => {
    // Navigate to Magic > Spells
    actions.automatedClicksPending++
    await navigation.switchPage(CONSTANTS.PAGES.MAGIC)
    await sleep(1000)

    actions.automatedClicksPending++
    await navigation.switchSubPage(CONSTANTS.SUBPAGES.SPELLS, CONSTANTS.PAGES.MAGIC)
    await sleep(1000)

    // Find all "Cast this spell" buttons and click them
    const allButtons = selectors.getAllButtons(true)
    const castButtons = allButtons.filter((btn) => btn.textContent === 'Cast this spell')

    logger({ msgLevel: 'log', msg: `Assist Mode: Casting ${castButtons.length} spells` })

    for (const button of castButtons) {
      actions.automatedClicksPending++
      button.click()
      await sleep(100)
    }

    // Re-check status
    await sleep(500)
    await checkSpellStatus()

    return { cast: castButtons.length }
  })
}

// Dismiss all spells (turn all off)
const dismissAllSpells = async () => {
  logger({ msgLevel: 'log', msg: 'Assist Mode: Dismissing all spells' })

  return actions.executeAction(async () => {
    // Navigate to Magic > Spells
    actions.automatedClicksPending++
    await navigation.switchPage(CONSTANTS.PAGES.MAGIC)
    await sleep(1000)

    actions.automatedClicksPending++
    await navigation.switchSubPage(CONSTANTS.SUBPAGES.SPELLS, CONSTANTS.PAGES.MAGIC)
    await sleep(1000)

    // Find all "Dismiss this spell" buttons and click them
    const allButtons = selectors.getAllButtons(true)
    const dismissButtons = allButtons.filter((btn) => btn.textContent === 'Dismiss this spell')

    logger({ msgLevel: 'log', msg: `Assist Mode: Dismissing ${dismissButtons.length} spells` })

    for (const button of dismissButtons) {
      actions.automatedClicksPending++
      button.click()
      await sleep(100)
    }

    // Re-check status
    await sleep(500)
    await checkSpellStatus()

    return { dismissed: dismissButtons.length }
  })
}

// Try to pray to spend capped resources
const tryPrayerAtCap = async () => {
  const cappedResources = getResourcesAtCap()

  if (cappedResources.length === 0) {
    return { prayed: false, reason: 'no_resources_at_cap' }
  }

  const cappedResourceIds = cappedResources.map((r) => r.id)

  logger({
    msgLevel: 'debug',
    msg: `Assist Mode: Checking prayers for capped resources: ${cappedResourceIds.join(', ')}`,
  })

  // Execute all navigation/clicking as automated actions
  return actions.executeAction(async () => {
    // Navigate to Magic page if not already there
    const onMagicPage = navigation.checkPage(CONSTANTS.PAGES.MAGIC)

    if (!onMagicPage) {
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Magic page' })
      actions.automatedClicksPending++ // switchPage will click a tab
      await navigation.switchPage(CONSTANTS.PAGES.MAGIC)
      await sleep(1000)
    }

    // Navigate to Prayers subpage
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Prayers subpage' })
    actions.automatedClicksPending++ // switchSubPage will click at least the subpage tab
    await navigation.switchSubPage(CONSTANTS.SUBPAGES.PRAYERS, CONSTANTS.PAGES.MAGIC)
    await sleep(1000)

    // Get all prayer buttons
    const buttons = selectors.getAllButtons(true, ':not(.btn-progress)')

    // Find prayers that use capped resources
    const prayerOptions = getPrayersThatConsume(cappedResourceIds)

    for (const prayer of prayerOptions) {
      const prayerKey = keyGen.magic.key(prayer.id)

      // Find the button for this prayer
      const button = buttons.find((btn) => {
        const id = reactUtil.getNearestKey(btn, 6)
        return id === prayerKey && !btn.classList.toString().includes('btn-off')
      })

      if (button) {
        // Find which capped resource this prayer uses
        const usedResource = prayer.req.find((req) => req.type === 'resource' && cappedResourceIds.includes(req.id))

        logger({
          msgLevel: 'log',
          msg: `Assist Mode: Praying ${prayer.id} to spend ${usedResource.id}`,
        })

        actions.automatedClicksPending++
        button.click()
        await sleep(500)

        // Navigate back to Build page
        actions.automatedClicksPending++ // switchPage will click a tab
        await navigation.switchPage(CONSTANTS.PAGES.BUILD)
        await sleep(500)

        return { prayed: true, prayer: prayer.id, resource: usedResource.id }
      }
    }

    // Navigate back to Build page
    actions.automatedClicksPending++ // switchPage will click a tab
    await navigation.switchPage(CONSTANTS.PAGES.BUILD)
    await sleep(500)

    return { prayed: false, reason: 'no_affordable_prayers' }
  })
}

// Helper: Select which subpage to check, avoiding recently failed ones
const selectSubpageToCheck = (candidateSubpages, failedSubpages) => {
  // Filter out recently failed subpages
  const viableSubpages = candidateSubpages.filter((sp) => !failedSubpages.includes(sp))

  // If all subpages failed recently, reset and try all again
  if (viableSubpages.length === 0) {
    return candidateSubpages[Math.floor(Math.random() * candidateSubpages.length)]
  }

  // Pick random from viable options
  return viableSubpages[Math.floor(Math.random() * viableSubpages.length)]
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

  if (!onBuildPage) {
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Navigating to Build page' })
    actions.automatedClicksPending++ // switchPage will click a tab
    await navigation.switchPage(CONSTANTS.PAGES.BUILD)
    await sleep(1000)
  }

  // Determine which subpages have buildings that consume capped resources (no navigation needed)
  const allSubpages = [CONSTANTS.SUBPAGES.CITY, CONSTANTS.SUBPAGES.COLONY, CONSTANTS.SUBPAGES.ABYSS]
  const candidateSubpages = []

  for (const subpage of allSubpages) {
    // Check if any buildings on this subpage could consume capped resources
    for (const resource of cappedResources) {
      const buildingsForResource = getBuildingsThatConsume(resource.id)

      // Check if any of these buildings are on this subpage (based on tab in building data)
      const subpageIndex = CONSTANTS.SUBPAGES_INDEX[subpage]
      const hasBuildings = buildingsForResource.some((b) => b.tab === subpageIndex)

      if (hasBuildings) {
        candidateSubpages.push(subpage)
        break // This subpage is a candidate, no need to check other resources
      }
    }
  }

  if (candidateSubpages.length === 0) {
    logger({ msgLevel: 'debug', msg: 'Assist Mode: No subpages have buildings for capped resources' })
    return { built: false, reason: 'no_candidate_subpages' }
  }

  // Select which subpage to check, avoiding recently failed ones
  const selectedSubpage = selectSubpageToCheck(candidateSubpages, recentlyFailedSubpages)

  logger({
    msgLevel: 'debug',
    msg: `Assist Mode: Checking ${selectedSubpage} for buildings (candidates: ${candidateSubpages.join(', ')}, failed: ${recentlyFailedSubpages.join(', ') || 'none'})`,
  })

  // Navigate to the selected subpage (only 1 navigation!)
  actions.automatedClicksPending++ // switchSubPage will click
  await navigation.switchSubPage(selectedSubpage, CONSTANTS.PAGES.BUILD)
  await sleep(1000)

  // Get all buildable buttons on this subpage
  const buttons = selectors.getAllButtons(false)
  const availableBuildings = []

  // Find buildings we can build for each capped resource
  for (const resource of cappedResources) {
    const buildingsForResource = getBuildingsThatConsume(resource.id)

    // Filter to only buildings that have available buttons on this subpage
    const affordableBuildings = buildingsForResource.filter((building) => {
      const buildingKey = keyGen.building.key(building.id)
      return buttons.some((btn) => {
        const id = reactUtil.getNearestKey(btn, 6)
        return id === buildingKey && !btn.classList.toString().includes('btn-off')
      })
    })

    // Add to our collection with metadata
    affordableBuildings.forEach((building) => {
      availableBuildings.push({
        building,
        resource,
        subpage: selectedSubpage,
        key: keyGen.building.key(building.id),
      })
    })
  }

  // If nothing affordable on this subpage, mark it as failed and try again next cycle
  if (availableBuildings.length === 0) {
    logger({ msgLevel: 'debug', msg: `Assist Mode: No affordable buildings on ${selectedSubpage}` })

    // Add to failed list (keep max 2 entries to prevent cycling through all failed pages)
    if (!recentlyFailedSubpages.includes(selectedSubpage)) {
      recentlyFailedSubpages.push(selectedSubpage)
      if (recentlyFailedSubpages.length > 2) {
        recentlyFailedSubpages.shift() // Remove oldest
      }
    }

    return { built: false, reason: 'no_affordable_buildings', subpage: selectedSubpage }
  }

  logger({
    msgLevel: 'debug',
    msg: `Assist Mode: Found ${availableBuildings.length} affordable buildings on ${selectedSubpage}: ${availableBuildings.map((b) => b.building.id).join(', ')}`,
  })

  // Randomly select one building from available options
  const randomIndex = Math.floor(Math.random() * availableBuildings.length)
  const selected = availableBuildings[randomIndex]

  // Find and click the button
  const button = buttons.find((btn) => {
    const id = reactUtil.getNearestKey(btn, 6)
    return id === selected.key && !btn.classList.toString().includes('btn-off')
  })

  if (button) {
    logger({
      msgLevel: 'log',
      msg: `Assist Mode: Building ${selected.building.id} on ${selected.subpage} to spend ${selected.resource.id} (${Math.round(selected.resource.percentage * 100)}% full)`,
    })

    // Click using actions wrapper to prevent resetting idle timer
    await actions.click(button)

    lastBuildAction = Date.now()
    // Reset failed subpages on success
    recentlyFailedSubpages = []
    await sleep(500)
    return { built: true, building: selected.building.id, resource: selected.resource.id, subpage: selected.subpage }
  }

  logger({ msgLevel: 'error', msg: 'Assist Mode: Button disappeared before clicking' })
  return { built: false, reason: 'button_disappeared' }
}

// Main assist mode loop
const assistLoop = async () => {
  // Only run if assist mode is enabled
  if (!state.options.assistMode?.enabled) {
    return
  }

  // Respect the main automation pause button
  if (state.scriptPaused) {
    logger({ msgLevel: 'debug', msg: 'Assist Mode: Script is paused, not running' })
    return
  }

  // Check if user is idle
  const idleThreshold = state.options.assistMode?.idleSeconds ? state.options.assistMode.idleSeconds * 1000 : 600000
  if (!actions.isUserIdle(idleThreshold)) {
    const idleTime = actions.getIdleTimeSeconds()
    const thresholdSec = Math.floor(idleThreshold / 1000)
    logger({ msgLevel: 'debug', msg: `Assist Mode: User not idle yet (${idleTime}s / ${thresholdSec}s)` })
    return
  }

  // Get current capped resources
  const cappedResources = getResourcesAtCap()
  const cappedResourceIds = cappedResources.map((r) => r.id)

  // Check if research or faith are capped and we can check magic (cooldown passed)
  const researchIsCapped = cappedResourceIds.includes('research')
  const faithIsCapped = cappedResourceIds.includes('faith')
  const shouldCheckMagic = (researchIsCapped || faithIsCapped) && canCheckMagic()

  if (shouldCheckMagic) {
    // Update cooldown timer once - we only check once per cooldown period
    lastMagicCheckAction = Date.now()

    // Check spell status while we're on the Magic page anyway
    try {
      await checkSpellStatus()
    } catch (e) {
      logger({ msgLevel: 'error', msg: `Assist Mode spell check error: ${e.message}` })
      console.error(e)
    }

    // Try research if research resource is capped (if enabled)
    if (researchIsCapped && state.options.assistMode?.research !== false) {
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Research is capped, checking for research opportunities...' })

      try {
        const researchResult = await tryResearchAtCap()
        if (researchResult.researched) {
          return // Successfully researched, done for this cycle
        }
        if (researchResult.reason === 'no_affordable_research') {
          logger({ msgLevel: 'debug', msg: 'Assist Mode: No affordable research for capped resources' })
        }
      } catch (e) {
        logger({ msgLevel: 'error', msg: `Assist Mode research error: ${e.message}` })
        console.error(e)
      }
    }

    // Try prayers if faith resource is capped (if enabled)
    if (faithIsCapped && state.options.assistMode?.prayers !== false) {
      logger({ msgLevel: 'debug', msg: 'Assist Mode: Faith is capped, checking for prayer opportunities...' })

      try {
        const prayerResult = await tryPrayerAtCap()
        if (prayerResult.prayed) {
          return // Successfully prayed, done for this cycle
        }
        if (prayerResult.reason === 'no_affordable_prayers') {
          logger({ msgLevel: 'debug', msg: 'Assist Mode: No affordable prayers for capped resources' })
        }
      } catch (e) {
        logger({ msgLevel: 'error', msg: `Assist Mode prayer error: ${e.message}` })
        console.error(e)
      }
    }
  }

  // Try building if cooldown has passed (every 5 seconds) and buildings are enabled
  if (canBuild() && state.options.assistMode?.buildings !== false) {
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
  } else if (state.options.assistMode?.buildings !== false) {
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
      idleSeconds: 600,
    }
  }

  actions.initActivityMonitor()

  // Run assist loop every 10 seconds
  setInterval(assistLoop, 10000)

  logger({
    msgLevel: 'log',
    msg: `Assist Mode initialized (${state.options.assistMode.enabled ? 'enabled' : 'disabled'})`,
  })
}

export default { init, getResourcesAtCap, castAllSpells, dismissAllSpells, checkSpellStatus }
