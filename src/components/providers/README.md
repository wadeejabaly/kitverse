# Providers

Client-side context providers that wrap the whole app in
`src/app/[locale]/layout.tsx`.

- **`ConsentProvider`** — cookie-consent state, persisted in a first-party
  cookie. Read it with `useConsent()`; every non-essential script must check
  it before loading.

## Motion

The only animation runtime is GSAP + ScrollTrigger, loaded on demand for the
hero's desktop parallax (`src/components/motion/`, gated by
`heavyMotionAllowed()` - phones and reduced-motion readers never fetch it).
Scrolling itself is the browser's own (no smooth-scroll library). Any motion
must respect `prefers-reduced-motion` (global backstop in `globals.css`) and
must not be required to read the page.
