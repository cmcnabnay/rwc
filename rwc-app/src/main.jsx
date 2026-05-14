import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './rwc (1).jsx'
import { Analytics } from '@vercel/analytics/react'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>
)