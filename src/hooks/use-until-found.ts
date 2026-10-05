import * as React from 'react'
import { flushSync } from 'react-dom'

/**
 * Keeps a collapsed panel in the page and findable. Render the element with `hidden={!open}`
 * and the returned ref, which also sets `ref` when given. While closed it carries
 * `hidden="until-found"`, so its text is in the HTML for search engines and the browser's find
 * in page can reach it. When a search or a link to a text fragment matches inside, the browser
 * fires `beforematch` and `onFound` runs, so the owner opens it through its own state. Without
 * `onFound` the panel is plainly hidden.
 *
 * Browsers that do not know `until-found` treat it as plain `hidden`.
 */
export function useUntilFound<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onFound?: () => void,
  ref?: React.Ref<T>,
) {
  const nodeRef = React.useRef<T>(null)
  const openRef = React.useRef(open)
  const onFoundRef = React.useRef(onFound)
  const findable = onFound !== undefined

  React.useLayoutEffect(() => {
    openRef.current = open
    onFoundRef.current = onFound
  })

  // React only writes `hidden` as a boolean, so the server sends a plain `hidden` and this
  // turns it into `until-found` as soon as the page is interactive, and after every close.
  React.useLayoutEffect(() => {
    const el = nodeRef.current
    if (!el || open) return
    el.setAttribute('hidden', findable ? 'until-found' : '')
  }, [open, findable])

  React.useEffect(() => {
    const el = nodeRef.current
    if (!el || !findable) return
    const onBeforeMatch = () => {
      // The browser scrolls to the match right after this event, so the panel has to be at
      // its full height now rather than on the first frame of its opening transition.
      const duration = el.style.transitionDuration
      el.style.transitionDuration = '0s'
      flushSync(() => onFoundRef.current?.())
      requestAnimationFrame(() => {
        el.style.transitionDuration = duration
        // The browser drops `hidden` by itself. If the owner kept the panel closed (a
        // controlled value that did not follow), hide it again so the page matches the state.
        if (!openRef.current) el.setAttribute('hidden', 'until-found')
      })
    }
    el.addEventListener('beforematch', onBeforeMatch)
    return () => el.removeEventListener('beforematch', onBeforeMatch)
  }, [findable])

  return React.useCallback(
    (node: T | null) => {
      nodeRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
}
