import { state, reactUtil, localStorage } from '../utils'
import manageAssistMode from './manageAssistMode'
import assistMode from '../assist-mode'
import armyAssistant from '../army-assistant'

const id = 'theresmore-automation'
let controlPanel

const createPanel = (switchScriptState) => {
  let scriptState = state.scriptPaused ? `Start` : `Stop`

  // Check localStorage for collapsed state (default to expanded)
  const isCollapsed = localStorage.get('panelCollapsed') ?? false

  const controlPanelElement = document.createElement('div')
  controlPanelElement.id = id
  controlPanelElement.classList.add('dark')
  controlPanelElement.classList.add('dark:bg-mydark-300')
  controlPanelElement.classList.add('taControlPanelElement')

  controlPanelElement.innerHTML = `
    <div class="flex items-center justify-between mb-2 gap-2">
      <span>Theresmore Automation ${taVersion ? `v${taVersion}` : ''}</span>
      <button type="button" class="text-xs opacity-60 hover:opacity-100 taToggleCollapse">${isCollapsed ? '▲' : '▼'}</button>
    </div>
    <div class="taCollapsibleContent" style="display: ${isCollapsed ? 'none' : 'block'}">
      <div>
        <button type="button" class="btn btn-blue mb-2 taScriptState">${scriptState}</button>
        <button type="button" class="btn btn-blue mb-2 taManageOptions">Manage Options</button>
      </div>
      <div class="mb-2">
        Legacies: <span class="legacyCount">0</span>; LP: <span class="lpCount">0</span>
      </div>
      <div class="mb-2 taSpellStatus">
        <div class="text-sm mb-1">
          Spells: <span class="spellCount">?/?</span>
        </div>
        <div class="flex gap-1">
          <button type="button" class="btn btn-sm btn-green taCastAllSpells">All On</button>
          <button type="button" class="btn btn-sm btn-red taDismissAllSpells">All Off</button>
        </div>
      </div>
      <div class="mb-2">
        <div class="text-sm mb-1">Army Assistant <span class="text-xs text-gray-400">(uses existing units)</span>:</div>
        <div class="flex gap-1">
          <button type="button" class="btn btn-sm btn-blue taArmyScoutOnly">🔍 Scout</button>
          <button type="button" class="btn btn-sm btn-blue taArmyFightOnly">⚔️ Fight</button>
          <button type="button" class="btn btn-sm btn-blue taArmyBoth">⚔️ Both</button>
        </div>
      </div>
    </div>
    <div class="taMinimizedInfo text-sm" style="display: ${isCollapsed ? 'block' : 'none'}">
      Spells: <span class="spellCount">?/?</span>
    </div>
  `
  document.querySelector('div#root').insertAdjacentElement('afterend', controlPanelElement)
  controlPanel = document.querySelector(`div#${id}`)

  // Toggle collapse button
  const toggleButton = controlPanel.querySelector('.taToggleCollapse')
  const collapsibleContent = controlPanel.querySelector('.taCollapsibleContent')
  const minimizedInfo = controlPanel.querySelector('.taMinimizedInfo')

  toggleButton.addEventListener('click', () => {
    const isCurrentlyCollapsed = collapsibleContent.style.display === 'none'

    if (isCurrentlyCollapsed) {
      // Expand - show down arrow to indicate "click to collapse"
      collapsibleContent.style.display = 'block'
      minimizedInfo.style.display = 'none'
      toggleButton.textContent = '▼'
      localStorage.set('panelCollapsed', false)
    } else {
      // Collapse - show up arrow to indicate "click to expand"
      collapsibleContent.style.display = 'none'
      minimizedInfo.style.display = 'block'
      toggleButton.textContent = '▲'
      localStorage.set('panelCollapsed', true)
    }
  })

  controlPanel.querySelector('.taScriptState').addEventListener('click', switchScriptState)
  controlPanel.querySelector('.taManageOptions').addEventListener('click', manageAssistMode.togglePanel)

  // Spell control buttons
  const castButton = controlPanel.querySelector('.taCastAllSpells')
  const dismissButton = controlPanel.querySelector('.taDismissAllSpells')

  castButton.addEventListener('click', async () => {
    // Disable both buttons to prevent multiple clicks
    castButton.disabled = true
    dismissButton.disabled = true
    castButton.textContent = 'Casting...'

    try {
      await assistMode.castAllSpells()
      updatePanel() // Update display after casting
    } finally {
      // Re-enable buttons
      castButton.disabled = false
      dismissButton.disabled = false
      castButton.textContent = 'All On'
    }
  })

  dismissButton.addEventListener('click', async () => {
    // Disable both buttons to prevent multiple clicks
    castButton.disabled = true
    dismissButton.disabled = true
    dismissButton.textContent = 'Dismissing...'

    try {
      await assistMode.dismissAllSpells()
      updatePanel() // Update display after dismissing
    } finally {
      // Re-enable buttons
      castButton.disabled = false
      dismissButton.disabled = false
      dismissButton.textContent = 'All Off'
    }
  })

  // Army assistant buttons
  const scoutButton = controlPanel.querySelector('.taArmyScoutOnly')
  const fightButton = controlPanel.querySelector('.taArmyFightOnly')
  const bothButton = controlPanel.querySelector('.taArmyBoth')
  let armyRunning = false
  let activeButton = null

  const startArmyAssistant = async (mode, button) => {
    if (armyRunning) {
      // Stop requested
      armyAssistant.stop()
      return
    }

    // Start army assistant
    armyRunning = true
    activeButton = button
    state.armyAssistantRunning = true
    button.textContent = '⏹ Stop'
    button.classList.remove('btn-blue')
    button.classList.add('btn-red')
    castButton.disabled = true
    dismissButton.disabled = true

    // Disable other army buttons
    if (button !== scoutButton) scoutButton.disabled = true
    if (button !== fightButton) fightButton.disabled = true
    if (button !== bothButton) bothButton.disabled = true

    try {
      await armyAssistant.autoScoutAndFight(mode)
    } finally {
      // Reset all buttons to start state
      armyRunning = false
      activeButton = null
      state.armyAssistantRunning = false
      scoutButton.textContent = '🔍 Scout'
      scoutButton.classList.remove('btn-red')
      scoutButton.classList.add('btn-blue')
      scoutButton.disabled = false
      fightButton.textContent = '⚔️ Fight'
      fightButton.classList.remove('btn-red')
      fightButton.classList.add('btn-blue')
      fightButton.disabled = false
      bothButton.textContent = '⚔️ Both'
      bothButton.classList.remove('btn-red')
      bothButton.classList.add('btn-blue')
      bothButton.disabled = false
      castButton.disabled = false
      dismissButton.disabled = false
    }
  }

  scoutButton.addEventListener('click', () => startArmyAssistant('scout', scoutButton))
  fightButton.addEventListener('click', () => startArmyAssistant('fight', fightButton))
  bothButton.addEventListener('click', () => startArmyAssistant('both', bothButton))
}

const updatePanel = () => {
  let scriptState = state.scriptPaused ? `Start` : `Stop`
  controlPanel.querySelector('.taScriptState').innerHTML = scriptState
  // Note: Spell status is updated by updateStats.js every 100ms
}

export default { createPanel, updatePanel }
