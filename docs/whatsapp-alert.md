# WhatsApp order alert

Order alerts to the owner's own WhatsApp. (Moved from CLAUDE.md 2026-11-23, unchanged.)

Owner decision 2026-11-02 (Part 9): the instant an order is approved (website "Approve" button, or
setting any order's status to Confirmed in admin), one WhatsApp message per shirt line goes to the
owner's own number - photo + team/title, version, size, name & number, patches. Code is in
`src/lib/notify-whatsapp.ts`, wired into `approveWebOrder`/`changeOrderStatus` in
`src/app/admin/orders-actions.ts`. It does nothing until all three of `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TO_NUMBER` are set (same "not configured yet" pattern as
PayPal/PayPlus).

**Sends free-form, not a template** (revised 2026-11-02, same day): the original plan needed an
approved message template, which needs Meta Business Verification, which needs a registered legal
business - the owner doesn't have one yet ("WABA not allowed to manage templates" blocked template
creation entirely). So the code sends a plain image+caption (or plain text) message instead - no
template, no approval, no business verification. The tradeoff: WhatsApp only lets a business message
a number *freely* if that number messaged *it* first within the last 24 hours. The owner must
message the connected WhatsApp number once (any text) to open that window; alerts sent outside it
fail silently (logged only) until he messages it again. If the business gets registered later, an
approved template is the sturdier long-term option (no daily re-opt-in) - see git history for the
template version of this file if that's worth reviving then.

To turn it on:
1. A Meta Business Account + the WhatsApp Business Platform set up on it, with a phone number
   connected (can be a new number - it only ever sends to the owner, never to a customer). WhatsApp
   Manager's Phone numbers / API Setup page gives the **phone number ID**; generate a **permanent
   access token** for a System User with `whatsapp_business_messaging` - these become
   `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN`. `WHATSAPP_TO_NUMBER` is the owner's own
   WhatsApp number, E.164 (e.g. `9725XXXXXXXX`).
2. Set the three env vars in Vercel (I can do this part once given the values) and redeploy.
3. The owner messages the connected WhatsApp number from his phone once (opens the 24h window),
   then approves an order to test. Re-message it whenever more than a day has passed since the last
   alert and a new one doesn't arrive.
