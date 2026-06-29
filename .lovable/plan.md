## Plan

1. **Fix the chat window sizing on native mobile**
   - Replace the current `height: 100dvh - keyboardOffset` approach with a safer layout that uses the visible viewport height directly.
   - Keep the chat panel pinned above the Android keyboard instead of letting the keyboard cover the input area.

2. **Make the input row always visible while typing**
   - Ensure the input container is fixed at the bottom of the chat panel and never hidden behind the keyboard.
   - Add stable height/min-height rules so the text field does not collapse or expand incorrectly.
   - Keep the send button visible and aligned with the input.

3. **Improve keyboard focus behavior**
   - On input focus and viewport resize, scroll the messages area and the input into view after the keyboard animation finishes.
   - Avoid automatic layout jumps that push the typed text under the keyboard prediction bar.

4. **Preserve current chat behavior**
   - Keep End Chat centered above the input.
   - Keep message deletion when End Chat is confirmed.
   - Keep existing greeting, language selector, callback form, and send-message logic unchanged.

5. **Verify with mobile simulation**
   - Test the chat at a narrow Android-like viewport.
   - Confirm typed text remains visible in the input, the send button remains clickable, and End Chat stays above the input.