# Levia’s blog — interface design system

This is the project’s own design guide. It adapts the Apple and Linear references in the `awesome-design-md` collection, while preserving the blog’s existing Swiss/editorial identity rather than copying either brand.

## Visual direction

- Quiet editorial surfaces: content and typography lead; navigation stays compact and low-contrast until active.
- Keep the existing moss accent, warm neutral light canvas, near-black dark canvas, local fonts, and hairline dividers. Do not introduce a new brand gradient or a second accent color.
- Borrow the Apple reference’s edge-to-edge treatment and careful safe-area handling on phones, and the Linear reference’s restrained hierarchy, precise spacing, and sparse accent use.
- Preserve the existing desktop header and browser-mobile top bar. The bottom dock is exclusive to installed standalone PWA mode.

## PWA navigation

- The dock is one floating rounded tray, aligned to the safe-area inset and clear of page controls.
- Four destinations only: home, articles, moments, and menu. Keep labels visible only for the active destination; use the moss surface as the single active cue.
- Opening the menu reveals one rounded sheet with short, scannable categories. Avoid a second permanent navigation rail or a competing bottom bar in normal mobile web mode.
- Keep page transitions quick and preserve browser back/forward behavior. Prefer one restrained spring or transform over page-wide motion.

## Animated icon rules

- Use the MIT `lottie-web` SVG player with the attributed `useAnimations` Lottie icon assets for shared navigation and control affordances.
- Animate on direct interaction (tap, hover, or keyboard focus), not continuously. Keep each animation brief, monochrome, and recolored with the current text color.
- Retain inline SVG fallbacks so icons remain legible before the player loads, without JavaScript, offline, and under `prefers-reduced-motion`.
- Never replace brand marks, logos, meaningful illustrations, or content-specific icons merely to animate them. Lottie is progressive enhancement, not a required dependency for understanding controls.

## Accessibility and responsive behavior

- Buttons keep their text or `aria-label`; decorative icon containers use `aria-hidden="true"`.
- Respect `prefers-reduced-motion` by leaving the static fallback in place and disabling icon playback.
- Keep focus indicators, at least 44px interaction targets for primary mobile controls, and `viewport-fit=cover` safe-area padding.
- Dark/light mode follows the system until the visitor explicitly selects a preference.

## Reference notes

- `VoltAgent/awesome-design-md` — Apple: restrained chrome and edge-to-edge product framing.
- `VoltAgent/awesome-design-md` — Linear: quiet hierarchy, hairline surfaces, and intentional accent use.
- These are inspiration only; project tokens in `themes/brutalism/assets/css/swiss.css` remain authoritative.
