import { useState, useCallback, useEffect } from 'react'
import { useWebcam } from '../lib/useWebcam'
import { useAuth } from '../lib/auth'

const ENGINE_URL = import.meta.env.VITE_API_URL || ''

type Mode = 'detecting' | 'enroll' | 'verify'
type Step = 'position' | 'capturing' | 'processing' | 'done'

export default function FaceVerify() {
  const { videoRef, ready, error: camError, captureFrame } = useWebcam()
  const { completeFaceVerify, tenantId, logout } = useAuth()
  const [mode, setMode] = useState<Mode>('detecting')
  const [step, setStep] = useState<Step>('position')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [similarity, setSimilarity] = useState<number | null>(null)

  const watchlistName = `face2fa_${tenantId}`

  // Auto-detect: try to identify the user silently when camera is ready
  useEffect(() => {
    if (!ready || mode !== 'detecting') return
    let cancelled = false

    const detect = async () => {
      try {
        const frame = await captureFrame()
        const form = new FormData()
        form.append('image', frame, 'face.jpg')
        form.append('watchlist_name', watchlistName)
        form.append('top_k', '1')
        form.append('threshold', '0.4')

        const res = await fetch(`${ENGINE_URL}/api/v1/identify`, { method: 'POST', body: form })
        const data = await res.json()

        if (cancelled) return

        if (data.face && data.matches && data.matches.length > 0) {
          // Already enrolled — go straight to verify mode
          setSimilarity(data.matches[0].similarity)
          setMessage(`Welcome back! (${(data.matches[0].similarity * 100).toFixed(0)}% match)`)
          setStep('done')
          setMode('verify')
          setTimeout(() => completeFaceVerify(), 1200)
        } else {
          // Not enrolled — guide them through setup
          setMode('enroll')
        }
      } catch {
        if (!cancelled) setMode('enroll')
      }
    }

    // Small delay to let camera warm up
    const timer = setTimeout(detect, 800)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [ready, mode, captureFrame, watchlistName, completeFaceVerify])

  const handleEnroll = useCallback(async () => {
    setError('')
    setStep('capturing')

    try {
      const frame = await captureFrame()
      setStep('processing')

      const form = new FormData()
      form.append('image', frame, 'face.jpg')
      form.append('label', tenantId || 'user')
      form.append('watchlist_name', watchlistName)

      const res = await fetch(`${ENGINE_URL}/api/v1/watchlist/enroll`, { method: 'POST', body: form })
      const data = await res.json()

      if (data.identity_id) {
        setMessage('Face registered! Verifying...')
        setStep('done')
        // Verify after enrollment
        setTimeout(async () => {
          try {
            const verifyFrame = await captureFrame()
            const vForm = new FormData()
            vForm.append('image', verifyFrame, 'face.jpg')
            vForm.append('watchlist_name', watchlistName)
            vForm.append('top_k', '1')
            vForm.append('threshold', '0.4')
            const vRes = await fetch(`${ENGINE_URL}/api/v1/identify`, { method: 'POST', body: vForm })
            const vData = await vRes.json()
            if (vData.face && vData.matches && vData.matches.length > 0) {
              setMessage(`All set! Face 2FA is active. (${(vData.matches[0].similarity * 100).toFixed(0)}% match)`)
              setTimeout(() => completeFaceVerify(), 1200)
            } else {
              setMessage('Face registered! Redirecting...')
              setTimeout(() => completeFaceVerify(), 1000)
            }
          } catch {
            setTimeout(() => completeFaceVerify(), 1000)
          }
        }, 1500)
      } else {
        setError('Could not register your face. Make sure your face is clearly visible and try again.')
        setStep('position')
      }
    } catch (e: any) {
      setError(e.message || 'Registration failed')
      setStep('position')
    }
  }, [captureFrame, tenantId, watchlistName, completeFaceVerify])

  const handleVerify = useCallback(async () => {
    setError('')
    setStep('capturing')

    try {
      const frame = await captureFrame()
      setStep('processing')

      const form = new FormData()
      form.append('image', frame, 'face.jpg')
      form.append('watchlist_name', watchlistName)
      form.append('top_k', '1')
      form.append('threshold', '0.4')

      const res = await fetch(`${ENGINE_URL}/api/v1/identify`, { method: 'POST', body: form })
      const data = await res.json()

      if (data.face && data.matches && data.matches.length > 0) {
        setSimilarity(data.matches[0].similarity)
        setMessage(`Verified! (${(data.matches[0].similarity * 100).toFixed(0)}% match)`)
        setStep('done')
        setTimeout(() => completeFaceVerify(), 1200)
      } else if (data.face) {
        setError('Face not recognized. Try again or re-enroll.')
        setStep('position')
      } else {
        setError('No face detected. Please look at the camera.')
        setStep('position')
      }
    } catch (e: any) {
      setError(e.message || 'Verification failed')
      setStep('position')
    }
  }, [captureFrame, watchlistName, completeFaceVerify])

  // Stepper dots for enrollment
  const enrollSteps = [
    { key: 'position', label: 'Position' },
    { key: 'capture', label: 'Capture' },
    { key: 'done', label: 'Done' },
  ]
  const activeStepIndex = step === 'position' ? 0 : step === 'capturing' || step === 'processing' ? 1 : 2

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/10 border border-indigo-500/20">
            {mode === 'detecting' ? (
              <svg className="h-6 w-6 text-indigo-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : mode === 'enroll' ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-indigo-400" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-indigo-400" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            )}
          </div>

          {mode === 'detecting' && (
            <>
              <h1 className="text-2xl font-bold">Checking your account...</h1>
              <p className="mt-2 text-sm text-gray-400">Looking for your face enrollment</p>
            </>
          )}

          {mode === 'enroll' && (
            <>
              <h1 className="text-2xl font-bold">Set Up Face 2FA</h1>
              <p className="mt-2 text-sm text-gray-400">
                {step === 'position' && 'Position your face in the frame and click the button below'}
                {step === 'capturing' && 'Hold still...'}
                {step === 'processing' && 'Registering your face...'}
                {step === 'done' && 'You\'re all set!'}
              </p>
            </>
          )}

          {mode === 'verify' && (
            <>
              <h1 className="text-2xl font-bold">Face Verification</h1>
              <p className="mt-2 text-sm text-gray-400">
                {step === 'position' && 'Look at the camera to verify your identity'}
                {step === 'capturing' && 'Capturing...'}
                {step === 'processing' && 'Verifying...'}
                {step === 'done' && 'Identity confirmed'}
              </p>
            </>
          )}
        </div>

        {/* Progress stepper for enrollment */}
        {mode === 'enroll' && (
          <div className="mb-4 flex items-center justify-center gap-2">
            {enrollSteps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-all ${
                  i < activeStepIndex
                    ? 'bg-green-500 text-white'
                    : i === activeStepIndex
                      ? 'bg-indigo-500 text-white ring-2 ring-indigo-500/30'
                      : 'bg-white/5 text-gray-500 border border-white/10'
                }`}>
                  {i < activeStepIndex ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-xs ${i === activeStepIndex ? 'text-white' : 'text-gray-500'}`}>
                  {s.label}
                </span>
                {i < enrollSteps.length - 1 && (
                  <div className={`h-px w-8 ${i < activeStepIndex ? 'bg-green-500' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Camera */}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 relative">
          {camError ? (
            <div className="flex h-64 items-center justify-center p-6 text-center text-sm text-red-400">
              {camError}. Please allow camera access and reload.
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full"
                style={{ transform: 'scaleX(-1)' }}
                muted
                playsInline
              />
              {/* Face guide overlay for enrollment */}
              {mode === 'enroll' && step === 'position' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-60 rounded-[50%] border-2 border-dashed border-indigo-400/50" />
                </div>
              )}
              {/* Processing overlay */}
              {(step === 'capturing' || step === 'processing' || mode === 'detecting') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="h-8 w-8 text-indigo-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm text-white/80">
                      {mode === 'detecting' ? 'Detecting...' : step === 'capturing' ? 'Capturing...' : 'Processing...'}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Status messages */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400 flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {message}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 space-y-3">
          {mode === 'enroll' && step === 'position' && (
            <>
              <button
                onClick={handleEnroll}
                disabled={!ready}
                className="w-full rounded-lg bg-indigo-500 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
                Register My Face
              </button>
              <button
                onClick={() => { setMode('verify'); setStep('position') }}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm text-gray-400 transition hover:border-white/20 hover:text-white"
              >
                I've already enrolled — verify instead
              </button>
            </>
          )}

          {mode === 'verify' && step === 'position' && (
            <>
              <button
                onClick={handleVerify}
                disabled={!ready}
                className="w-full rounded-lg bg-indigo-500 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                Verify Face
              </button>
              <button
                onClick={() => { setMode('enroll'); setStep('position'); setError(''); setMessage('') }}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm text-gray-400 transition hover:border-white/20 hover:text-white"
              >
                Re-enroll my face
              </button>
            </>
          )}
        </div>

        <button
          onClick={logout}
          className="mt-4 w-full text-center text-sm text-gray-500 transition hover:text-gray-300"
        >
          Cancel and sign out
        </button>

        <p className="mt-6 text-center text-xs text-gray-600">
          Powered by OpenBiometrics — eating our own dogfood
        </p>
      </div>
    </div>
  )
}
