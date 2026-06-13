import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ToastProvider } from './lib/useToast'
import './index.css'

type OrientationLockType = 'portrait' | 'portrait-primary'

interface ScreenOrientationWithLock {
  lock?: (orientation: OrientationLockType) => Promise<void>
}

const lockMobileOrientation = async () => {
  if (typeof window === 'undefined') {
    return
  }

  const isSmallScreen = window.matchMedia('(max-width: 1024px)').matches
  const orientation = (typeof screen !== 'undefined'
    ? (screen.orientation as ScreenOrientationWithLock | undefined)
    : undefined)
  const supportsOrientationLock = typeof orientation?.lock === 'function'

  if (!isSmallScreen || !supportsOrientationLock) {
    return
  }

  try {
    await orientation!.lock!('portrait-primary')
  } catch {
    // Fallback für iOS – versuche trotzdem 'portrait'
    try {
      await orientation!.lock!('portrait')
    } catch {
      // Orientierungssperre wird nicht unterstützt
    }
  }
}

void lockMobileOrientation()
window.addEventListener('orientationchange', () => {
  void lockMobileOrientation()
})

// Zusätzliche iPhone-spezifische Maßnahmen
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
  // Starke Sperr-Strategien für iOS
  const applyIOSFixes = () => {
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')

    // Viewport-Größe auf 100% setzen
    html.style.width = '100vw'
    html.style.height = '100dvh'
    html.style.position = 'fixed'
    html.style.top = '0'
    html.style.left = '0'
    html.style.right = '0'
    html.style.bottom = '0'
    html.style.margin = '0'
    html.style.padding = '0'
    html.style.overflow = 'hidden'

    body.style.width = '100vw'
    body.style.height = '100dvh'
    body.style.position = 'fixed'
    body.style.top = '0'
    body.style.left = '0'
    body.style.right = '0'
    body.style.bottom = '0'
    body.style.margin = '0'
    body.style.padding = '0'
    body.style.overflow = 'hidden'
    body.style.overflowY = 'auto'

    if (root) {
      root.style.width = '100vw'
      root.style.height = '100dvh'
      root.style.position = 'fixed'
      root.style.top = '0'
      root.style.left = '0'
      root.style.right = '0'
      root.style.bottom = '0'
      root.style.overflow = 'hidden'
      root.style.overflowY = 'auto'
    }
  }

  // Initial Apply
  applyIOSFixes()

  // Reapply on orientation change
  window.addEventListener('orientationchange', () => {
    setTimeout(applyIOSFixes, 100)
  })

  // Reapply on resize
  window.addEventListener('resize', () => {
    applyIOSFixes()
  })

  // Prevent rotation by listening to device orientation
  if ((window as any).DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (event: any) => {
      // Block landscape orientation
      if (Math.abs(event.gamma) > 45 || Math.abs(event.beta) > 45) {
        // Attempt to lock portrait
        const orientation = (screen as any).orientation
        if (orientation?.lock) {
          orientation.lock('portrait-primary').catch(() => {
            orientation.lock('portrait').catch(() => {})
          })
        }
      }
    }, true)
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
