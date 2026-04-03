
## 5-Digit Security PIN Feature

### Overview
Add a compulsory 5-digit PIN that users must set after their first login. PIN is required at login AND for sensitive actions (withdrawals, payments, profile changes). Can work alongside fingerprint and 2FA.

### Database Changes
1. **`user_pins` table** — stores hashed PIN per user
   - `user_id`, `pin_hash`, `pin_set_at`, `failed_attempts`, `locked_until`
2. **`security_questions` table** — predefined question options
3. **`user_security_answers` table** — stores user's 3 chosen questions + hashed answers
   - `user_id`, `question_id`, `answer_hash`

### Edge Functions
4. **`pin-management`** — handles:
   - Set PIN (first time after login)
   - Verify PIN (for login/sensitive actions)
   - Reset PIN via security questions
   - Reset PIN via OTP (if security questions fail)
   - Lock after 5 failed attempts

### Frontend Components
5. **`PinSetup`** — PIN creation + 3 security questions (shown after first login)
6. **`PinEntry`** — 5-digit PIN input dialog (reusable for login + actions)
7. **`PinRecovery`** — security questions → OTP fallback → new PIN
8. **Auth flow update** — redirect to PIN setup if no PIN exists after login
9. **Sensitive action guards** — require PIN before withdrawals, payments, profile changes

### Security
- PINs stored as bcrypt hashes
- Security answers stored hashed (case-insensitive, trimmed)
- 5 failed PIN attempts → 15min lockout
- Rate limiting on PIN verification
- PIN works alongside existing 2FA and fingerprint
