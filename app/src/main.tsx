import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts, tokens and base styles first, so component CSS comes after them.
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.tsx'
import { migrateLegacyStorage } from './app/legacyStorage.ts'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('index.html is missing the #root element')
}

// Before anything reads storage.
migrateLegacyStorage()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
