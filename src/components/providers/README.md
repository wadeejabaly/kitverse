# Providers

Client-side context providers that wrap the whole app in
`src/app/[locale]/layout.tsx`.

- **`ConsentProvider`** — cookie-consent state, persisted in a first-party
  cookie. Read it with `useConsent()`.
- **`ConsentGatedScript`** — loads a third-party script only after the visitor
  has accepted. Every non-essential script must go through it.

## No animation runtime

This project ships no animation library. The design is quiet retail: hover
states, a small image scale on product cards, and nothing that needs a
scroll-driven runtime. Motion that does get added must respect
`prefers-reduced-motion` (there is a global backstop in `globals.css`) and
must not be required to read the page.
