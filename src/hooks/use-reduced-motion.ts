import * as React from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** True when the user asked the system for less motion. Updates if the setting changes. */
export function useReducedMotion() {
  const [reduced, setReduced] = React.useState(
    () => typeof matchMedia === 'function' && matchMedia(QUERY).matches,
  )
  React.useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
