import { reactUtil, state } from '../utils'

const updateStats = () => {
  const controlPanel = document.querySelector('div#theresmore-automation')

  if (controlPanel && reactUtil.getGameData()) {
    controlPanel.querySelector('.legacyCount').innerText = reactUtil.getGameData().LegacyStore.ownedLegacies.length ?? 0
    controlPanel.querySelector('.lpCount').innerText = (reactUtil.getGameData().run.resources.find((res) => res.id === 'legacy') || { value: 0 }).value ?? 0

    // Update spell status display (updates all spell count elements for both expanded and minimized views)
    if (state.spellStatus) {
      const { active, total } = state.spellStatus
      const spellCountElements = controlPanel.querySelectorAll('.spellCount')

      spellCountElements.forEach((spellCountElement) => {
        spellCountElement.innerHTML = `${active}/${total}`

        // Color code: green if all active, yellow if some, red if none
        if (active === total && total > 0) {
          spellCountElement.style.color = '#4ade80' // green
        } else if (active > 0) {
          spellCountElement.style.color = '#fbbf24' // yellow
        } else if (total > 0) {
          spellCountElement.style.color = '#f87171' // red
        } else {
          spellCountElement.style.color = '' // default
        }
      })
    }
  }
}

export default updateStats
