## Goal
When the user clicks **End Chat** in the customer care bot, clear the chat session and return them to the page they were on before opening the chat (e.g., Dashboard).

## Changes
**File:** `src/components/ChatSupport.tsx`

1. When the chat is opened (`setIsOpen(true)`), capture the current location (`window.location.pathname + search`) into a ref `originRouteRef`.
2. In the End Chat confirm handler:
   - Clear messages, `chat-session-id`, and any draft input (already done).
   - Close the chat panel (`setIsOpen(false)`).
   - If the user has navigated elsewhere while chatting, use `react-router`'s `useNavigate` to navigate back to `originRouteRef.current`. If they're still on the same route, just close the panel.
3. The header **X** (Close) stays as-is — it only collapses without clearing or navigating.

## Notes
- Chat is a global floating widget, so "going back" means restoring the route active at the moment the chat was opened, not browser `history.back()` (which could leave the app).
- No backend or business logic changes.