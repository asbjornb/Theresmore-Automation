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
  </p>
  `
  document.querySelector('div#root').insertAdjacentElement('afterend', controlPanelElement)
  controlPanel = document.querySelector(`div#${id}`)
  controlPanel.querySelector('.taScriptState').addEventListener('click', switchScriptState)
  controlPanel.querySelector('.taManageOptions').addEventListener('click', manageAssistMode.togglePanel)

  // Spell control buttons
  controlPanel.querySelector('.taCastAllSpells').addEventListener('click', async () => {
    await assistMode.castAllSpells()
    updatePanel() // Update display after casting
  })

  controlPanel.querySelector('.taDismissAllSpells').addEventListener('click', async () => {
    await assistMode.dismissAllSpells()
    updatePanel() // Update display after dismissing
  })
}

const updatePanel = () => {
  let scriptState = state.scriptPaused ? `Start` : `Stop`
  controlPanel.querySelector('.taScriptState').innerHTML = scriptState
  // Note: Spell status is updated by updateStats.js every 100ms
}

export default { createPanel, updatePanel }
