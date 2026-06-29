## Problem
On Android, typed text in the customer-care chat input is not visible. The soft keyboard overlaps the input, and the textarea/input doesn't scroll or resize correctly so the caret sits below the visible area.

## Root cause
`src/components/ChatSupport.tsx` currently uses a `visualViewport` listener that shrinks the card via `calc(100dvh - keyboardHeight)`, but:
- It's a single-line `<Input>` whose caret can still be hidden behind the keyboard on Android WebView because the parent card height is set, not the input position.
- No `scrollIntoView` is run when the viewport actually resizes (only on focus, with a fixed 300ms delay that fires before the keyboard finishes animating).
- The messages `ScrollArea` doesn't recompute, so the input row can be pushed off-screen inside the flex container.
- No `enterkeyhint`, `inputMode`, or `autoComplete` hints; font-size <16px can also trigger Android zoom that hides the field.

## Fix plan (frontend only, `src/components/ChatSupport.tsx`)

1. **Reliable viewport tracking**
   - Keep the `visualViewport` listener but also handle `scroll` events on it (Android fires scroll, not just resize, when the keyboard opens).
   - Store `keyboardHeight` and apply it as `paddingBottom` on the input container (sticky bottom) instead of only shrinking the card. This guarantees the input row floats above the keyboard regardless of flex math.

2. **Keep input visible**
   - On every `visualViewport` resize/scroll event AND on input `focus`, call `inputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })` inside a `requestAnimationFrame` (not a hard 300ms timer).
   - Also re-scroll the messages list to bottom whenever keyboard height changes so the latest message + input stay in view.

3. **Prevent Android zoom / caret hiding**
   - Force input `font-size: 16px` (Tailwind `text-base`) so Android WebView does not auto-zoom on focus (auto-zoom is what most often hides the caret).
   - Add `enterKeyHint="send"`, `inputMode="text"`, `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="sentences"` for predictable keyboard behavior.

4. **Layout hardening**
   - Wrap input row in a `sticky bottom-0 bg-background` container with `pb-[env(safe-area-inset-bottom)]` so it never gets clipped by the gesture bar.
   - Use `min-h-0` on the flex children that contain the `ScrollArea` so the input row is never pushed out of the card.
   - Replace fixed `h-[500px]` with `h-[100dvh] max-md:h-[100dvh] md:h-[600px]` and a proper `flex-col` so the input always has a reserved slot at the bottom.

5. **No behavior change elsewhere**
   - Header, End Chat button, message rendering, and chat session logic stay exactly as they are.

## Verification
- Build typecheck.
- Drive Playwright at 412×915 (Android viewport), focus the input, simulate keyboard height via `page.evaluate` on `visualViewport`, screenshot to confirm caret + typed text remain visible above the keyboard region.
