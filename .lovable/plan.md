

## Problem
The current chat close mechanism uses small "Back" and "X" buttons in the header that are hard to tap on mobile PWA. The header area is cramped with both buttons plus avatar and language selector.

## Solution
Add a prominent, always-visible floating close (X) button at the top-right corner of the chat window, with a large touch target (44x44px minimum). Also simplify the header by removing the redundant "Back" button since the X serves the same purpose.

### Changes to `src/components/ChatSupport.tsx`

1. **Replace the header close controls** (lines ~216-232): Remove the row with both "Back" and "X" buttons. Replace with a single, large fixed-position X button at the top-right of the chat card with proper touch target sizing (48x48px, `rounded-full`, high contrast).

2. **Add a sticky close button overlay**: Position an absolute X button at top-right of the chat Card, outside the header scroll area, so it's always accessible regardless of scroll position. Use `z-10` to float above content.

3. **Touch-friendly sizing**: The close button will be `h-12 w-12` (48px) with clear visual contrast (semi-transparent background with backdrop blur), ensuring easy tapping on PWA/mobile.

### Specific UI changes:
- Remove the "Back" button row entirely
- Add a floating circular X button (48x48px) positioned `absolute top-2 right-2` on the chat Card
- Keep the header content (avatar, title, language selector) but give it `pt-14` to avoid overlap with the close button
- The X icon will be prominent (24px) with a visible background circle

