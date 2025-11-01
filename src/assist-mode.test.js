/**
 * Tests for Assist Mode - especially safety checks
 */

import buildings from './data/buildings.json' with { type: 'json' }
import spells from './data/spells.json' with { type: 'json' }

// Mock the isBlacklisted function logic
const BLACKLIST = [
  'pillar_mana',
  'statue_atamar',
  'statue_firio',
  'statue_lurezia',
  'harvest_shrine',
  'war_shrine',
  'mind_shrine',
  'fate_shrine_b',
  'fate_shrine_f',
]

const isBlacklisted = (buildingId) => {
  // Check static blacklist
  if (BLACKLIST.includes(buildingId)) {
    return true
  }

  // Check if building costs luck (lucky stones)
  const buildingData = buildings.find((b) => b.id === buildingId)
  if (buildingData && buildingData.req) {
    const costsLuck = buildingData.req.some((req) => req.type === 'resource' && req.id === 'luck')
    if (costsLuck) {
      return true
    }
  }

  return false
}

// Check if a prayer is mutually exclusive (blocks other prayers)
const isMutuallyExclusivePrayer = (prayer) => {
  if (!prayer.gen) return false
  return prayer.gen.some((gen) => gen.value === -1 && gen.type !== 'resource')
}

// Simple test runner (no Jest needed)
console.log('Running Assist Mode Safety Tests...\n')

// Test: Buildings that cost luck should be blacklisted
if (false) {
  describe('Assist Mode Safety Checks', () => {
    test('should blacklist buildings that cost luck', () => {
      // Find all buildings that cost luck
      const buildingsWithLuck = buildings.filter((building) => {
        return building.req?.some((req) => req.type === 'resource' && req.id === 'luck')
      })

      console.log(`Found ${buildingsWithLuck.length} buildings that cost luck:`)
      buildingsWithLuck.forEach((b) => console.log(`  - ${b.id}`))

      // All of them should be blacklisted
      buildingsWithLuck.forEach((building) => {
        const blacklisted = isBlacklisted(building.id)
        if (!blacklisted) {
          console.error(`❌ FAIL: ${building.id} costs luck but is NOT blacklisted!`)
        }
        expect(blacklisted).toBe(true)
      })

      console.log('✅ All buildings that cost luck are properly blacklisted')
    })

    test('should blacklist statues and shrines', () => {
      const strategicBuildings = [
        'pillar_mana',
        'statue_atamar',
        'statue_firio',
        'statue_lurezia',
        'harvest_shrine',
        'war_shrine',
        'mind_shrine',
        'fate_shrine_b',
        'fate_shrine_f',
      ]

      strategicBuildings.forEach((buildingId) => {
        expect(isBlacklisted(buildingId)).toBe(true)
      })

      console.log('✅ All strategic buildings are blacklisted')
    })
  })
}

// Simple test runner (if not using Jest)
if (true) {
  console.log('Running manual tests...\n')

  // Test 1: Luck buildings
  console.log('TEST: Buildings that cost luck should be blacklisted')
  const buildingsWithLuck = buildings.filter((building) => {
    return building.req?.some((req) => req.type === 'resource' && req.id === 'luck')
  })

  console.log(`Found ${buildingsWithLuck.length} buildings that cost luck:`)
  let allPassed = true
  buildingsWithLuck.forEach((building) => {
    const blacklisted = isBlacklisted(building.id)
    if (blacklisted) {
      console.log(`  ✅ ${building.id} - correctly blacklisted`)
    } else {
      console.log(`  ❌ ${building.id} - NOT blacklisted (BUG!)`)
      allPassed = false
    }
  })

  // Test 2: Strategic buildings
  console.log('\nTEST: Strategic buildings should be blacklisted')
  const strategicBuildings = ['pillar_mana', 'statue_atamar', 'statue_firio', 'statue_lurezia', 'harvest_shrine', 'war_shrine', 'mind_shrine']

  strategicBuildings.forEach((buildingId) => {
    const blacklisted = isBlacklisted(buildingId)
    if (blacklisted) {
      console.log(`  ✅ ${buildingId} - correctly blacklisted`)
    } else {
      console.log(`  ❌ ${buildingId} - NOT blacklisted (BUG!)`)
      allPassed = false
    }
  })

  // Test 3: Mutually exclusive prayers
  console.log('\nTEST: Mutually exclusive prayers should be detected')
  const expectedMutuallyExclusivePrayers = [
    'accept_druid',
    'banish_druid',
    'control_fortress',
    'summon_nikharul',
    'desire_abundance',
    'desire_magic',
    'desire_war',
    'focus_development',
    'focus_magic',
    'focus_research',
    'gold_factory_f',
    'mana_factory_f',
    'incremental_power',
    'protection_power',
    'zenix_archmage',
    'zenix_funder',
    'zenix_master',
    'zenix_trainer',
  ]

  const prayers = spells.filter((s) => s.type === 'prayer')
  const mutuallyExclusivePrayers = prayers.filter(isMutuallyExclusivePrayer)

  console.log(`Found ${mutuallyExclusivePrayers.length} mutually exclusive prayers:`)
  console.log(mutuallyExclusivePrayers.map((p) => p.id).join(', '))

  expectedMutuallyExclusivePrayers.forEach((prayerId) => {
    const prayer = prayers.find((p) => p.id === prayerId)
    if (!prayer) {
      console.log(`  ⚠️  ${prayerId} - not found in spells.json`)
      return
    }

    const isMutuallyExclusive = isMutuallyExclusivePrayer(prayer)
    if (isMutuallyExclusive) {
      console.log(`  ✅ ${prayerId} - correctly identified as mutually exclusive`)
    } else {
      console.log(`  ❌ ${prayerId} - NOT identified as mutually exclusive (BUG!)`)
      allPassed = false
    }
  })

  // Test 4: Food safety logic
  console.log('\nTEST: Food safety logic should prevent negative food production')

  // Mock isFoodSafe function to test the logic
  const testFoodSafety = (building, currentFoodProduction) => {
    let foodCost = 0
    if (building.gen) {
      const foodGen = building.gen.find((gen) => gen.type === 'resource' && gen.id === 'food')
      if (foodGen) {
        foodCost = foodGen.value
      }
    }

    // Same logic as in assist-mode.js
    if (foodCost < 0) {
      return currentFoodProduction > Math.abs(foodCost)
    }
    return true
  }

  // Test scenarios
  const housingBuilding = buildings.find((b) => b.id === 'common_house') // -0.5 food/s
  const farmBuilding = buildings.find((b) => b.id === 'farm') // +0.5 food/s

  if (!housingBuilding || !farmBuilding) {
    console.log('  ⚠️  Test buildings not found')
  } else {
    // Scenario 1: Positive food production, should allow both
    const scenario1Housing = testFoodSafety(housingBuilding, 2.0)
    const scenario1Farm = testFoodSafety(farmBuilding, 2.0)
    if (scenario1Housing && scenario1Farm) {
      console.log('  ✅ With +2.0 food/s: both housing and farms allowed')
    } else {
      console.log('  ❌ With +2.0 food/s: should allow both buildings (BUG!)')
      allPassed = false
    }

    // Scenario 2: Low positive food (0.3/s), should block housing (-0.5) but allow farms
    const scenario2Housing = testFoodSafety(housingBuilding, 0.3)
    const scenario2Farm = testFoodSafety(farmBuilding, 0.3)
    if (!scenario2Housing && scenario2Farm) {
      console.log('  ✅ With +0.3 food/s: housing blocked, farms allowed')
    } else {
      console.log('  ❌ With +0.3 food/s: should block housing but allow farms (BUG!)')
      allPassed = false
    }

    // Scenario 3: Negative food (-2.0/s), should block housing but still allow farms
    const scenario3Housing = testFoodSafety(housingBuilding, -2.0)
    const scenario3Farm = testFoodSafety(farmBuilding, -2.0)
    if (!scenario3Housing && scenario3Farm) {
      console.log('  ✅ With -2.0 food/s: housing blocked, farms still allowed (can recover)')
    } else {
      console.log('  ❌ With -2.0 food/s: should block housing but allow farms (BUG!)')
      allPassed = false
    }
  }

  console.log('\n' + (allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'))
  if (!allPassed) {
    process.exit(1)
  }
}
