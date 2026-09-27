import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tokens and base styles first, so component CSS comes after them.
import './styles/tokens.css'
import './styles/global.css'
import App from './App.tsx'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('index.html is missing the #root element')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
