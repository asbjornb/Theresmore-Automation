import { state, reactUtil } from '../utils'
import manageOptions from './manageOptions'

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
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" class="taAssistMode" ${state.options.assistMode?.enabled ? 'checked' : ''}>
        <span class="text-sm">Assist Mode</span>
      </label>
      <div class="text-xs ml-5 mt-1 text-gray-400">
        Passive helper: builds cheapest option when resources hit 90% cap (after 60s idle).<br/>
        Safe: Won't build statues/shrines/pillars or make food negative. You keep control.
      </div>
    </div>
    <div class="mb-2">
      Legacies: <span class="legacyCount">0</span>; LP: <span class="lpCount">0</span>
    </div>
  </p>
  `
  document.querySelector('div#root').insertAdjacentElement('afterend', controlPanelElement)
  controlPanel = document.querySelector(`div#${id}`)
  controlPanel.querySelector('.taScriptState').addEventListener('click', switchScriptState)
  controlPanel.querySelector('.taManageOptions').addEventListener('click', manageOptions.togglePanel)

  // Add Assist Mode toggle handler
  controlPanel.querySelector('.taAssistMode').addEventListener('change', (e) => {
    if (!state.options.assistMode) {
      state.options.assistMode = { enabled: false, idleSeconds: 60 }
    }
    state.options.assistMode.enabled = e.target.checked
    localStorage.set('options', state.options)
    console.log('[TA] Assist Mode', e.target.checked ? 'enabled' : 'disabled')
  })
}

const updatePanel = () => {
  let scriptState = state.scriptPaused ? `Start` : `Stop`
  controlPanel.querySelector('.taScriptState').innerHTML = scriptState
}

export default { createPanel, updatePanel }
