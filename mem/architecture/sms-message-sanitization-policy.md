---
name: SMS Message Sanitization Policy
description: All outbound SMS must be sanitized to strip emojis and non-GSM-7 chars to prevent garbled glyphs (e.g., "dY%") from Onfon/Celcom gateways.
type: constraint
---
SMS gateways (Onfon Media, Celcom) mangle UTF-8 emojis & smart punctuation when transcoding to GSM-7, producing artifacts like "dY %" or "dY 3⁄4".

**Rule:** Every SMS sender (`send-transactional-sms`, `daily-payout-cron`, `retry-failed-payouts`, and any future SMS function) must pass `message` through a `sanitizeSmsMessage()` helper that:
- Strips emoji ranges `\u{1F000}-\u{1FFFF}` and `\u{2600}-\u{27BF}`
- Strips ZWJ/variation selectors (`\u200D`, `\uFE0F`, `\u20E3`)
- Replaces smart quotes/dashes/ellipsis/nbsp with ASCII equivalents
- Collapses extra whitespace

**Authoring rule:** Do NOT add emojis to SMS message templates or notification SMS text. Keep messages plain, professional, and prefixed with `Pamojanova:`. Emojis are allowed only in in-app push/notification titles, never in SMS body.
