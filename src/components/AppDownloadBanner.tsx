'use client'
import { useEffect, useState } from 'react'

export default function AppDownloadBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    // Clear the old "X dismissed" flag from the previous banner version —
    // otherwise anyone who once tapped X would never see Install again.
    try { localStorage.removeItem('appBannerDismissed') } catch { /* ignore */ }
    // ?install=1 forces the banner for testing on any device.
    try {
      if (new URLSearchParams(window.location.search).get('install') === '1') { setShow(true); return }
    } catch { /* ignore */ }
    const ua = navigator.userAgent
    const isAndroid = /Android/i.test(ua)
    const isInApp = ua.includes('SunriseMotelApp')
    if (isAndroid && !isInApp) setShow(true)
  }, [])
  if (!show) return null
  return (
    <div
      className="bg-yellow-500 text-black p-3 text-center text-sm flex justify-center items-center"
      style={{ background: '#EAB308', color: '#000', padding: 12, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', zIndex: 60 }}
    >
      <a href="/download" className="bg-black text-white px-4 py-1.5 rounded font-bold" style={{ background: '#000', color: '#fff', padding: '6px 16px', borderRadius: 6, fontWeight: 800, textDecoration: 'none' }}>Install</a>
    </div>
  )
}
