---
name: accessibility-wcag
description: Apply WCAG 2.2 AA accessibility requirements to web interfaces. Use when designing, implementing, or auditing landing pages, forms, navigation, modals, CTAs, visual media, animations, semantic HTML, ARIA, keyboard navigation, focus management, labels, target sizes, contrast, and reduced-motion behavior.
---

# Accessibility WCAG

Make the interface perceivable, operable, understandable, and robust. Prefer
semantic native HTML before adding ARIA.

## Implementation Rules

1. Use the correct native element for the job: `button`, `a`, `label`, `input`,
   `nav`, `main`, `section`, `header`, and `footer`.
2. Keep one clear `h1` and a sequential heading hierarchy.
3. Ensure normal text contrast is at least 4.5:1 and large text/UI contrast is
   at least 3:1.
4. Provide descriptive alt text for meaningful images and empty alt text for
   decorative images.
5. Give icon-only controls an accessible text label.
6. Ensure all interactive controls are keyboard reachable and have visible focus.
7. Keep target sizes at least 24x24 CSS px; prefer 44x44 px for primary touch
   controls.
8. Do not convey state, errors, or status by color alone.
9. Respect `prefers-reduced-motion` for animation-heavy sections.
10. Use live regions only for dynamic status updates that users need to hear.

## Landing Page Checks

- CTAs must be real links/buttons with clear accessible names.
- Forms must have visible labels, useful helper text, and errors near fields.
- Navigation order should match visual order.
- Sticky headers, modals, menus, and carousels must not trap users without an
  escape path.
- Copy must reflow under zoom and narrow mobile widths without clipping.

## Anti-Patterns

- Clickable `div` or `span` elements without role, keyboard handling, and focus.
- Removed focus rings.
- Placeholder-only form labels.
- Decorative animation that blocks reading or conversion.
- Modal focus that escapes into the background or cannot be dismissed.
