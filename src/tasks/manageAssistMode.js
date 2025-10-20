import { state, localStorage } from '../utils'
import manageOptions from './manageOptions'

const id = 'theresmore-automation-assist-panel'

const createPanel = () => {
  const panelElement = document.createElement('div')
  panelElement.id = id
  panelElement.classList.add('dark')
  panelElement.classList.add('taAssistPanel')

  panelElement.innerHTML = `
    <div class="taAssistPanelInner">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">Assist Mode Settings</h2>
        <button type="button" class="btn btn-blue taCloseAssistPanel">Close</button>
      </div>

      <div class="mb-6 p-4 bg-gray-800 rounded">
        <h3 class="font-bold mb-2">Philosophy</h3>
        <p class="text-sm text-gray-300">
          Assist Mode is designed to <strong>aid your manual play</strong>, not replace it.
          It only acts when you're idle and resources are going to waste.
          You maintain full control over strategic decisions like which statues, shrines, or dangerous research to pursue.
        </p>
      </div>

      <div class="mb-4">
        <label class="flex items-center gap-2 cursor-pointer mb-3">
          <input type="checkbox" class="taEnableAll" ${state.options.assistMode?.enabled ? 'checked' : ''}>
          <span class="font-bold">Enable All Assist Features</span>
        </label>

        <div class="ml-6 space-y-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="taAssistBuildings" ${state.options.assistMode?.buildings !== false ? 'checked' : ''}>
            <span>Assist with Buildings</span>
            <span class="text-xs text-gray-400">(every 5s - builds cheapest safe option)</span>
          </label>

          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="taAssistResearch" ${state.options.assistMode?.research !== false ? 'checked' : ''}>
            <span>Assist with Research</span>
            <span class="text-xs text-gray-400">(every 2min - skips dangerous research)</span>
          </label>

          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="taAssistPrayers" ${state.options.assistMode?.prayers !== false ? 'checked' : ''}>
            <span>Assist with Prayers</span>
            <span class="text-xs text-gray-400">(every 2min - uses excess faith)</span>
          </label>
        </div>
      </div>

      <div class="mb-6">
        <label class="block mb-2">
          <span class="font-bold">Idle Threshold (seconds before assisting):</span>
        </label>
        <input type="number" min="10" max="300" step="10" class="taIdleThreshold dark:bg-mydark-200 px-2 py-1 rounded" value="${state.options.assistMode?.idleSeconds || 60}">
        <p class="text-xs text-gray-400 mt-1">Default: 60 seconds. How long to wait after your last action before assist mode activates.</p>
      </div>

      <hr class="my-6 border-gray-700">

      <div class="mb-4">
        <button type="button" class="btn btn-gray taAdvancedSettings">Advanced Automation Settings</button>
        <p class="text-xs text-yellow-400 mt-2">
          ⚠️ Advanced automation is <strong>not compatible</strong> with Assist Mode. Use one or the other, not both.
        </p>
      </div>
    </div>
  `

  document.querySelector('div#root').insertAdjacentElement('afterend', panelElement)

  // Event listeners
  const panel = document.querySelector(`#${id}`)

  panel.querySelector('.taCloseAssistPanel').addEventListener('click', togglePanel)
  panel.querySelector('.taAdvancedSettings').addEventListener('click', () => {
    togglePanel()
    manageOptions.togglePanel()
  })

  // Enable All checkbox
  panel.querySelector('.taEnableAll').addEventListener('change', (e) => {
    const enabled = e.target.checked

    // Update all sub-checkboxes
    panel.querySelector('.taAssistBuildings').checked = enabled
    panel.querySelector('.taAssistResearch').checked = enabled
    panel.querySelector('.taAssistPrayers').checked = enabled

    // Save to state
    if (!state.options.assistMode) {
      state.options.assistMode = {}
    }
    state.options.assistMode.enabled = enabled
    state.options.assistMode.buildings = enabled
    state.options.assistMode.research = enabled
    state.options.assistMode.prayers = enabled

    localStorage.set('options', state.options)
    console.log('[TA] Assist Mode:', enabled ? 'enabled (all features)' : 'disabled')
  })

  // Individual feature checkboxes
  const updateFeature = (feature, checkbox) => {
    if (!state.options.assistMode) {
      state.options.assistMode = { enabled: false, idleSeconds: 60 }
    }
    state.options.assistMode[feature] = checkbox.checked

    // Update "Enable All" checkbox state
    const allEnabled =
      panel.querySelector('.taAssistBuildings').checked && panel.querySelector('.taAssistResearch').checked && panel.querySelector('.taAssistPrayers').checked

    panel.querySelector('.taEnableAll').checked = allEnabled
    state.options.assistMode.enabled = allEnabled

    localStorage.set('options', state.options)
    console.log(`[TA] Assist Mode - ${feature}:`, checkbox.checked ? 'enabled' : 'disabled')
  }

  panel.querySelector('.taAssistBuildings').addEventListener('change', (e) => updateFeature('buildings', e.target))
  panel.querySelector('.taAssistResearch').addEventListener('change', (e) => updateFeature('research', e.target))
  panel.querySelector('.taAssistPrayers').addEventListener('change', (e) => updateFeature('prayers', e.target))

  // Idle threshold
  panel.querySelector('.taIdleThreshold').addEventListener('change', (e) => {
    const seconds = parseInt(e.target.value, 10)
    if (!state.options.assistMode) {
      state.options.assistMode = { enabled: false }
    }
    state.options.assistMode.idleSeconds = seconds
    localStorage.set('options', state.options)
    console.log(`[TA] Assist Mode idle threshold: ${seconds}s`)
  })
}

const togglePanel = () => {
  const panelElement = document.querySelector(`div#${id}`)
  panelElement.classList.toggle('taAssistPanelVisible')
}

export default { createPanel, togglePanel }
