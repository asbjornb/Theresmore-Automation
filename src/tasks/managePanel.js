import { state, reactUtil, localStorage } from '../utils'
import manageAssistMode from './manageAssistMode'
import assistMode from '../assist-mode'
import armyAssistant from '../army-assistant'

const id = 'theresmore-automation'
let controlPanel

const createPanel = (switchScriptState) => {
  let scriptState = state.scriptPaused ? `Start` : `Stop`

  const controlPanelElement = document.createElement('div')
  controlPanelElement.id = id
  controlPanelElement.classList.add('dark')
  controlPanelElement.classList.add('dark:bg-mydark-300')
  controlPanelElement.classList.add('taControlPanelElement')

  controlPanelElement.innerHTML = `
    <p class="mb-2">Theresmore Automation ${taVersion ? `v${taVersion}` : ''}</p>
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
      <div class="text-sm mb-1">Army Assistant:</div>
      <div class="flex gap-1">
        <button type="button" class="btn btn-sm btn-blue taArmyAssistantStart">▶ Start</button>
        <button type="button" class="btn btn-sm btn-red taArmyAssistantStop" disabled>⏹ Stop</button>
      </div>
    </div>
  </p>
  `
  document.querySelector('div#root').insertAdjacentElement('afterend', controlPanelElement)
  controlPanel = document.querySelector(`div#${id}`)
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
  const startArmyButton = controlPanel.querySelector('.taArmyAssistantStart')
  const stopArmyButton = controlPanel.querySelector('.taArmyAssistantStop')

  startArmyButton.addEventListener('click', async () => {
    // Disable start, enable stop
    startArmyButton.disabled = true
    stopArmyButton.disabled = false
    castButton.disabled = true
    dismissButton.disabled = true

    try {
      await armyAssistant.autoScoutAndFight()
    } finally {
      // Re-enable start, disable stop
      startArmyButton.disabled = false
      stopArmyButton.disabled = true
      castButton.disabled = false
      dismissButton.disabled = false
    }
  })

  stopArmyButton.addEventListener('click', () => {
    armyAssistant.stop()
    stopArmyButton.disabled = true
  })
}

const updatePanel = () => {
  let scriptState = state.scriptPaused ? `Start` : `Stop`
  controlPanel.querySelector('.taScriptState').innerHTML = scriptState
  // Note: Spell status is updated by updateStats.js every 100ms
}

export default { createPanel, updatePanel }
