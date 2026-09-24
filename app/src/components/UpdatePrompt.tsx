/// <reference types="vite-plugin-pwa/client" />
import { useRegisterSW } from 'virtual:pwa-register/react'

// Offers a new build; never reloads unless the user accepts. Progress lives in
// localStorage, which the service worker never touches.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        right: 12,
        zIndex: 1000,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: 8,
        background: '#18181b',
        color: '#fafafa',
        boxShadow: '0 2px 12px rgba(0,0,0,.3)',
      }}
    >
      <span>A new version is available.</span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => updateServiceWorker(true)}>Update now</button>
        <button onClick={() => setNeedRefresh(false)}>Later</button>
      </span>
    </div>
  )
}
