// Applies the stored theme mode before first paint, so a forced light or
// dark mode never flashes the system palette. index.html loads it as a
// blocking classic script, not inline, so a strict `script-src 'self'` CSP
// needs no hash or 'unsafe-inline'. It must stay after the theme-color
// metas in index.html, which it updates.
//
// It mirrors readStoredThemeMode and applyThemeMode in src/app/theme.ts:
// same key, same validation, same theme-color values. theme-init.test.ts
// runs both against the same inputs. It also falls back to the key from
// before the rename to Settle, which src/app/legacyStorage.ts moves only
// once the app starts, after this script has run.
;(function () {
  const colors = { light: '#ffffff', dark: '#1c1f2b' }

  let mode = null
  try {
    mode =
      window.localStorage.getItem('settle.theme') ??
      window.localStorage.getItem('project-w.theme')
  } catch {
    // Unreadable storage means system.
  }
  if (mode !== 'light' && mode !== 'dark') {
    // System: the stylesheet and the metas' own media queries handle it.
    return
  }

  document.documentElement.setAttribute('data-theme', mode)
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', colors[mode])
  }
})()
