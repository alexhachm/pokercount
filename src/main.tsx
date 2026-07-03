import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// iOS standalone PWAs resume from suspension for days without a real page
// load, so the service worker would otherwise never check for a new deploy.
registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // update() rejects on network failure (offline is normal for this app)
    const check = () => registration.update().catch(() => {})
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
