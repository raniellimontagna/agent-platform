---
name: gsap-motion
description: Add or debug polished frontend motion with GSAP, timelines, ScrollTrigger, staggered transitions, transforms, and performance-conscious animation. Use when a task asks for GSAP, scroll animation, advanced web motion, or when a landing page would materially benefit from motion and the dependency is available or explicitly allowed.
---

# GSAP Motion

Use GSAP only when motion improves comprehension, conversion, or interaction feedback. Prefer CSS transitions for simple hover/focus effects.

## When To Use GSAP

- Sequenced hero or reveal animations.
- ScrollTrigger-driven sections, pinning, scrubbed progress, or parallax.
- Coordinated staggered lists, timelines, SVG, or canvas-like motion.
- React/Vue/Svelte integration where cleanup and lifecycle control matter.

## Implementation Rules

1. Check whether `gsap` is already installed before adding it.
2. If adding `gsap`, keep the dependency justified and local to the feature.
3. Animate compositor-friendly properties: `x`, `y`, `scale`, `rotation`, `opacity`, and `autoAlpha`.
4. Avoid animating layout-heavy properties such as `width`, `height`, `top`, `left`, `margin`, and `padding`.
5. Respect reduced-motion preferences where the stack makes that practical.
6. In React, scope animations to refs and clean them up on unmount.
7. Keep animations subtle enough that the page remains usable without waiting.

## Landing Page Defaults

- Hero: short entrance sequence, no long intro.
- Proof/benefits: staggered reveal only when elements enter view.
- CTA: motion should guide attention, not pulse indefinitely.
- Scroll effects: avoid pinning on mobile unless tested for layout stability.
