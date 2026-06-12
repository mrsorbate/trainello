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
  document.documentElement.style.width = '100vw'
  document.documentElement.style.height = '100vh'
  document.documentElement.style.position = 'fixed'
  document.body.style.width = '100vw'
  document.body.style.height = '100vh'
  document.body.style.position = 'fixed'
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
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
