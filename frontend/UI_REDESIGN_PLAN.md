# JobIntel v2 UI/UX Redesign Plan

## Problem
Current v2 frontend feels visually worse and less usable than the previous version. Users perceive it as:
- Visually less polished
- Harder to use
- Lacking cohesive design language

## Root Causes
1. **Inconsistent color system**: Ad-hoc dark theme tokens without clear hierarchy
2. **Typography**: Missing proper scale and font loading strategy
3. **Component polish**: Cards/buttons lack depth, hover states, and micro-interactions
4. **Layout rhythm**: Spacing feels arbitrary, no consistent grid system
5. **Navigation**: Functional but not visually integrated
6. **Empty/loading states**: Too minimal, feel broken

## Design Direction
Adopt **AI-Native UI** style: modern, dark, technical, premium feel.
- Primary: purple (#7C3AED)
- Accent: cyan (#0891B2)
- Background: deep navy/black (#0B0C0F)
- Cards: elevated surfaces with subtle borders
- Typography: Inter for body, Fira Code for display
- Motion: subtle stagger reveals, smooth transitions (300ms)

## Implementation Plan

### Phase 1: Design System Foundation
- [x] Update CSS variables to new palette
- [x] Add Inter font import
- [x] Define spacing scale (4/8/12/16/24/32/48)
- [x] Add animation utilities (fade-in, slide-up)

### Phase 2: App Shell Redesign
- [x] Redesign header with better brand treatment
- [x] Vector icons for nav (no emoji)
- [x] Active state indicators
- [x] Sticky nav with blur backdrop

### Phase 3: Page Polish
- [ ] Dashboard: Hero stats cards, better list cards, improved filters
- [ ] Market: Enhanced job cards with hover lift effect
- [ ] Reports: Card grid with status indicators
- [ ] Profile: Form layout improvements
- [ ] Roadmap: Timeline visualization
- [ ] JobDetail: Better info hierarchy

### Phase 4: Micro-interactions
- [ ] Card hover effects (lift + border glow)
- [ ] Button press feedback
- [ ] Loading skeletons
- [ ] Stagger entrance animations
- [ ] Smooth page transitions

### Phase 5: Responsive & Accessibility
- [x] Mobile nav (already done)
- [ ] Tablet breakpoint refinements
- [x] Focus states (already done)
- [ ] Reduced motion support

## Success Criteria
- Visual polish score: 8/10+
- Navigation clarity: 9/10
- Responsive behavior: 375px-1440px+
- E2E tests: 20/20 passing
- User perception: "Looks professional and modern"
