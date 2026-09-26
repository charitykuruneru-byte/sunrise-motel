'use client'
import { useEffect, useState } from 'react'

export default function AppDownloadBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent
    const isAndroid = /Android/i.test(ua)
    const isInApp = ua.includes('SunriseMotelApp')
    const dismissed = localStorage.getItem('appBannerDismissed')
    if (isAndroid && !isInApp && !dismissed) setShow(true)
  }, [])
  if (!show) return null
  return (
    <div className="bg-yellow-500 text-black p-3 text-center text-sm flex justify-center items-center">
      <a href="/download" className="bg-black text-white px-4 py-1.5 rounded font-bold">Install</a>
    </div>
  )
}
