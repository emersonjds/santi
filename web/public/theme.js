// Runs before first paint; src/shared/lib/theme.ts applies later changes with the same key and colours.
;(function () {
  var KEY = 'santi-theme'
  var BAR = { light: '#ffffff', dark: '#0f0f0e' }
  var media = matchMedia('(prefers-color-scheme: dark)')

  var last = 'system'

  var stored = function () {
    try {
      var value = localStorage.getItem(KEY)
      last = value === 'light' || value === 'dark' ? value : 'system'
    } catch (error) {
      // storage blocked since load: keep the last choice read
    }
    return last
  }

  var apply = function () {
    var choice = stored()
    var resolved =
      choice === 'system' ? (media.matches ? 'dark' : 'light') : choice
    document.documentElement.dataset.theme = resolved
    var meta = document.querySelector('meta[name=theme-color]')
    if (meta) meta.setAttribute('content', BAR[resolved])
  }

  apply()
  media.addEventListener('change', function () {
    if (stored() === 'system') apply()
  })
})()
