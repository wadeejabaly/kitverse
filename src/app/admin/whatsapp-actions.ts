"use server";

import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";

/**
 * One-time WhatsApp Cloud API registration (owner report 2026-11-02: order alerts failing with Meta
 * error 133010 "Account not registered"). Adding/verifying a number in WhatsApp Manager's UI is a
 * DIFFERENT step from registering it on the Cloud API - that second step has no button anywhere in
 * WhatsApp Manager and only exists as a direct API call: POST {phone_number_id}/register with a PIN,
 * which becomes (or must match) the number's own two-step-verification PIN. Meta caps this at 10 calls
 * per number per 72h, so it's a one-click, one-time fix, not something to run repeatedly.
 *
 * Uses the server's own already-configured WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID - this
 * action never decrypts, logs, or displays the token itself, only Meta's response.
 */
export async function registerWhatsAppNumber(pin: string) {
  const staff = await requireStaff();
  const e = env();
  if (!e.WHATSAPP_PHONE_NUMBER_ID || !e.WHATSAPP_ACCESS_TOKEN) {
    return { ok: false, message: "WhatsApp isn't configured yet - missing the phone number ID or access token." };
  }
  if (!/^\d{6}$/.test(pin)) return { ok: false, message: "PIN must be exactly 6 digits." };

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
  } catch (err) {
    return { ok: false, message: `Network error reaching Meta: ${(err as Error).message}` };
  }
  const body = await res.text().catch(() => "");

  await db().from("audit_log").insert({
    actor: staff.id, action: "whatsapp.register", entity: "setting", entity_id: "whatsapp",
    after: { status: res.status, body: body.slice(0, 1000) },
  });

  if (!res.ok) return { ok: false, message: `Meta rejected it (HTTP ${res.status}): ${body}` };
  return { ok: true, message: "Registered. Order alerts should go through now - place a test order to confirm." };
}
