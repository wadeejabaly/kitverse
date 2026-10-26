import { RotateCcw, FlaskConical } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { TEST_CHAT_USER } from "@/lib/conversation/test-chat";
import { testChatSend } from "../../actions";
import { Thread, type ThreadMsg } from "../thread";
import { PageHeader, Card, EmptyState, Badge, button } from "../../ui";
import SendBox from "./send-box";

export const dynamic = "force-dynamic";

/** Talk to the bot as if you were a customer. Same brain, prices and tools; nothing goes to Instagram. */
export default async function TestChat() {
  await requireStaff();
  const customer = (await db().from("customers").select("id").eq("ig_user_id", `sim:${TEST_CHAT_USER}`).maybeSingle()).data;
  const conv = customer ? (await db().from("conversations").select("id").eq("customer_id", customer.id).eq("channel", "simulator").maybeSingle()).data : null;
  const msgs = conv ? ((await db().from("messages").select("id,direction,sender,kind,text,transcript,media,status,created_at")
    .eq("conversation_id", conv.id).neq("status", "discarded").order("created_at").limit(200)).data ?? []) as ThreadMsg[] : [];
  const cost = conv ? ((await db().from("agent_runs").select("cost_usd").eq("conversation_id", conv.id)).data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0) : 0;
  return (
    <>
      <PageHeader title="Test the bot" subtitle="Chat as a customer. Same catalog, prices and rules - nothing is sent to Instagram, orders made here are marked as tests."
        actions={<>
          <Badge>${cost.toFixed(3)} this chat</Badge>
          <form action={testChatSend}><input type="hidden" name="reset" value="1" /><button className={button.ghost}><RotateCcw className="h-4 w-4" /> New chat</button></form>
        </>} />
      <Card className="min-h-[50vh]">
        {msgs.length ? <Thread messages={msgs} /> : <EmptyState icon={FlaskConical} title="Say hi like a customer would" text="Try: قديش بلوزة برشلونة الجديدة؟ · or send a size question, a discount request, a team we don't have." />}
      </Card>
      <SendBox />
    </>
  );
}
