import { state, reactUtil, localStorage } from '../utils'
import manageAssistMode from './manageAssistMode'
import assistMode from '../assist-mode'

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
      <button type="button" class="btn btn-sm btn-purple taArmyAssistant">Auto Scout & Fight</button>
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

  // Army assistant button
  const armyButton = controlPanel.querySelector('.taArmyAssistant')

  armyButton.addEventListener('click', async () => {
    // Disable button and update text
    armyButton.disabled = true
    armyButton.textContent = 'Running...'
    armyButton.classList.remove('btn-purple')
    armyButton.classList.add('btn-orange')

    try {
      await assistMode.autoScoutAndFight()
    } finally {
      // Re-enable button
      armyButton.disabled = false
      armyButton.textContent = 'Auto Scout & Fight'
      armyButton.classList.remove('btn-orange')
      armyButton.classList.add('btn-purple')
    }
  })
}

const updatePanel = () => {
  let scriptState = state.scriptPaused ? `Start` : `Stop`
  controlPanel.querySelector('.taScriptState').innerHTML = scriptState
  // Note: Spell status is updated by updateStats.js every 100ms
}

export default { createPanel, updatePanel }
