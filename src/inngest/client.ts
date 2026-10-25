import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "kitverse" });

/** Event names (data shapes documented next to each sender). */
export const EV = {
  messageReceived: "conversation/message.received", // { conversationId }
  resume: "conversation/resume",                     // { conversationId, note? } after an owner decision
  quoteSent: "conversation/quote.sent",              // { conversationId, at }
  approvalCreated: "approval/created",               // { approvalId, conversationId }
  approvalDecided: "approval/decided",               // { approvalId }
} as const;
