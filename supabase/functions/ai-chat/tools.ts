// D4 AI – Action Mode tool registry.
// Every tool validates permissions, business rules and (for sensitive tools)
// requires an explicit confirmation before it touches anything.

export type ToolCtx = {
  svc: any;               // service-role client (reads + logging)
  userClient: any;        // user-scoped client (RPCs run as the signed-in user)
  authHeader: string;
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  settings: Record<string, boolean>;
  supabaseUrl: string;
};

type Def = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  admin?: boolean;
  sensitive?: boolean;         // needs confirm:true when confirmations are on
  gate?: string;               // ai_settings key that must be enabled
  run: (a: any, c: ToolCtx) => Promise<any>;
};

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: props,
  required,
  additionalProperties: false,
});
const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });
const B = (description: string) => ({ type: "boolean", description });

const CONFIRM = { confirm: B("Set true only after the user has explicitly confirmed this exact action.") };

const money = (n: unknown) => `NGN ${Number(n ?? 0).toLocaleString()}`;

async function callFn(c: ToolCtx, fn: string, body: unknown) {
  const res = await fetch(`${c.supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: c.authHeader },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function requireUser(c: ToolCtx) {
  if (!c.userId) throw new Error("You need to sign in first. Open /login to continue.");
}

/* ------------------------------- USER TOOLS ------------------------------ */

const userTools: Def[] = [
  {
    name: "get_wallet",
    description: "Get the signed-in user's wallet balance and any funds on hold.",
    parameters: obj({}),
    run: async (_a, c) => {
      requireUser(c);
      const [{ data: w }, { data: avail }] = await Promise.all([
        c.svc.from("wallets").select("balance, updated_at").eq("user_id", c.userId).maybeSingle(),
        c.svc.rpc("wallet_available", { _user_id: c.userId }),
      ]);
      return { balance: Number(w?.balance ?? 0), available: Number(avail ?? w?.balance ?? 0) };
    },
  },
  {
    name: "list_transactions",
    description: "List the user's recent transactions. Filter by type or status when asked.",
    parameters: obj({
      limit: N("How many rows, max 25."),
      type: S("airtime | data | wallet | cable | electricity | refund | cashback"),
      status: S("success | pending | failed | refunded"),
    }),
    run: async (a, c) => {
      requireUser(c);
      let q = c.svc.from("transactions")
        .select("id, type, amount, status, reference, description, created_at")
        .eq("user_id", c.userId).order("created_at", { ascending: false })
        .limit(Math.min(Number(a.limit) || 10, 25));
      if (a.type) q = q.eq("type", a.type);
      if (a.status) q = q.eq("status", a.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { transactions: data ?? [] };
    },
  },
  {
    name: "spending_summary",
    description: "Calculate what the user has spent over a period (day, week, month, year, lifetime).",
    parameters: obj({ period: S("day | week | month | year | lifetime") }, ["period"]),
    run: async (a, c) => {
      requireUser(c);
      const now = Date.now();
      const days: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
      let q = c.svc.from("transactions").select("type, amount, status, created_at").eq("user_id", c.userId);
      if (a.period !== "lifetime") {
        q = q.gte("created_at", new Date(now - (days[a.period] ?? 30) * 864e5).toISOString());
      }
      const { data } = await q;
      const spend = (data ?? []).filter((t: any) => t.status === "success" && !["wallet", "refund", "cashback"].includes(t.type));
      const byType: Record<string, number> = {};
      let total = 0;
      for (const t of spend) { byType[t.type] = (byType[t.type] ?? 0) + Number(t.amount); total += Number(t.amount); }
      return { period: a.period, total, count: spend.length, by_type: byType };
    },
  },
  {
    name: "find_plans",
    description: "Search live data plans. Use to compare prices or find the cheapest / best value plan for a network and size.",
    parameters: obj({
      network: S("mtn | airtel | glo | 9mobile"),
      size: S("Data size hint, e.g. '1GB', '500MB'."),
      cheapest: B("Sort by price ascending and return the best value first."),
      limit: N("Max rows (default 8)."),
    }),
    run: async (a, c) => {
      let q = c.svc.from("data_plans")
        .select("id, plan_id, network, plan_name, data_size, validity, selling_price, is_active, provider")
        .eq("is_active", true)
        .order("selling_price", { ascending: true })
        .limit(Math.min(Number(a.limit) || 8, 20));
      if (a.network) q = q.ilike("network", `%${a.network}%`);
      if (a.size) q = q.or(`data_size.ilike.%${a.size}%,plan_name.ilike.%${a.size}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { plans: data ?? [] };
    },
  },
  {
    name: "buy_data",
    description: "Buy a data plan for the user. Always call find_plans first, show the exact plan + price, and get confirmation.",
    parameters: obj({ plan_id: S("The data_plans.id UUID."), phone: S("Recipient phone number."), ...CONFIRM }, ["plan_id", "phone"]),
    sensitive: true,
    gate: "user_actions",
    run: async (a, c) => {
      requireUser(c);
      const { data: plan } = await c.svc.from("data_plans").select("*").eq("id", a.plan_id).maybeSingle();
      if (!plan || !plan.is_active) throw new Error("That plan is not available.");
      const { data: w } = await c.svc.from("wallets").select("balance").eq("user_id", c.userId).maybeSingle();
      if (Number(w?.balance ?? 0) < Number(plan.selling_price)) {
        throw new Error(`Insufficient balance. Plan costs ${money(plan.selling_price)}, wallet has ${money(w?.balance)}. Fund at /wallet.`);
      }
      const r = await callFn(c, "vtu-purchase", {
        action: "buy-data", planId: plan.id, plan_id: plan.plan_id, network: plan.network, phone: a.phone,
      });
      if (!r.data?.success) throw new Error(r.data?.error || "Purchase failed.");
      return { ok: true, plan: plan.plan_name, amount: plan.selling_price, phone: a.phone, tx_id: r.data.tx_id ?? r.data.txId, receipt_url: "/transactions" };
    },
  },
  {
    name: "buy_airtime",
    description: "Buy airtime for the user.",
    parameters: obj({ network: S("mtn | airtel | glo | 9mobile"), phone: S("Recipient phone."), amount: N("Naira amount."), ...CONFIRM }, ["network", "phone", "amount"]),
    sensitive: true,
    gate: "user_actions",
    run: async (a, c) => {
      requireUser(c);
      const amount = Number(a.amount);
      if (!(amount >= 50)) throw new Error("Minimum airtime amount is NGN 50.");
      const { data: w } = await c.svc.from("wallets").select("balance").eq("user_id", c.userId).maybeSingle();
      if (Number(w?.balance ?? 0) < amount) throw new Error(`Insufficient balance (${money(w?.balance)}). Fund at /wallet.`);
      const r = await callFn(c, "vtu-purchase", { action: "buy-airtime", network: a.network, phone: a.phone, amount });
      if (!r.data?.success) throw new Error(r.data?.error || "Airtime purchase failed.");
      return { ok: true, network: a.network, phone: a.phone, amount, tx_id: r.data.tx_id ?? r.data.txId };
    },
  },
  {
    name: "buy_electricity",
    description: "Pay an electricity bill (prepaid or postpaid).",
    parameters: obj({ disco: S("Disco code e.g. EKEDC, IKEDC, AEDC."), meter: S("Meter number."), meter_type: S("prepaid | postpaid"), amount: N("Naira amount."), ...CONFIRM }, ["disco", "meter", "meter_type", "amount"]),
    sensitive: true,
    gate: "user_actions",
    run: async (a, c) => {
      requireUser(c);
      const r = await callFn(c, "vtu-purchase", { action: "buy-electricity", disco: a.disco, meter: a.meter, meterType: a.meter_type, amount: Number(a.amount) });
      if (!r.data?.success) throw new Error(r.data?.error || "Electricity payment failed.");
      return { ok: true, ...r.data };
    },
  },
  {
    name: "buy_cable",
    description: "Pay a cable TV subscription (DSTV, GOTV, Startimes).",
    parameters: obj({ provider: S("dstv | gotv | startimes"), plan: S("Plan/bouquet code."), smartcard: S("Smartcard / IUC number."), amount: N("Naira amount."), ...CONFIRM }, ["provider", "plan", "smartcard", "amount"]),
    sensitive: true,
    gate: "user_actions",
    run: async (a, c) => {
      requireUser(c);
      const r = await callFn(c, "vtu-purchase", { action: "buy-cable", provider: a.provider, plan: a.plan, smartcard: a.smartcard, amount: Number(a.amount) });
      if (!r.data?.success) throw new Error(r.data?.error || "Cable payment failed.");
      return { ok: true, ...r.data };
    },
  },
  {
    name: "create_funding_request",
    description: "Create a bank-transfer wallet funding request. Returns the bank account the user should pay into. Card funding is at /wallet.",
    parameters: obj({ amount: N("Naira amount to fund."), ...CONFIRM }, ["amount"]),
    sensitive: true,
    gate: "user_actions",
    run: async (a, c) => {
      requireUser(c);
      const amount = Number(a.amount);
      if (!(amount >= 100)) throw new Error("Minimum funding amount is NGN 100.");
      const { data: pending } = await c.svc.rpc("has_pending_funding", { _user_id: c.userId });
      if (pending) throw new Error("You already have a pending funding request. Wait for it to be reviewed before creating another.");
      const { data: bank } = await c.svc.from("payment_bank_accounts")
        .select("bank_name, account_name, account_number").eq("is_active", true)
        .order("is_default", { ascending: false }).limit(1).maybeSingle();
      const reference = `FR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const { data, error } = await c.userClient.from("funding_requests")
        .insert({ user_id: c.userId, amount, reference, provider: "bank", status: "pending", bank: bank?.bank_name ?? null, note: "Created via D4 AI" })
        .select("id, reference, amount, status").single();
      if (error) throw new Error(error.message);
      return { ok: true, request: data, pay_to: bank, next: "Upload your receipt at /wallet so an admin can approve it." };
    },
  },
  {
    name: "get_referrals",
    description: "Get the user's referral code, link and earnings.",
    parameters: obj({}),
    run: async (_a, c) => {
      requireUser(c);
      const [{ data: p }, { data: rewards }] = await Promise.all([
        c.svc.from("profiles").select("referral_code").eq("id", c.userId).maybeSingle(),
        c.svc.from("referral_rewards").select("amount, status, created_at").eq("referrer_id", c.userId),
      ]);
      const earned = (rewards ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const site = Deno.env.get("PUBLIC_SITE_URL") || "https://data4me.lovable.app";
      return { code: p?.referral_code, link: `${site}/?ref=${p?.referral_code ?? ""}`, referrals: rewards?.length ?? 0, earned };
    },
  },
  {
    name: "create_support_ticket",
    description: "Open a support ticket for the user when you cannot resolve the issue.",
    parameters: obj({ subject: S("Short subject."), message: S("Full description."), ...CONFIRM }, ["subject", "message"]),
    sensitive: true,
    run: async (a, c) => {
      requireUser(c);
      const { data: p } = await c.svc.from("profiles").select("full_name, email").eq("id", c.userId).maybeSingle();
      const { error } = await c.svc.from("contact_messages").insert({
        user_id: c.userId, name: p?.full_name || "User", email: p?.email || c.email || "unknown@data4me",
        subject: a.subject, message: a.message,
      });
      if (error) throw new Error(error.message);
      return { ok: true, note: "Support ticket created. The team will reply by email." };
    },
  },
];

/* ------------------------------ ADMIN TOOLS ------------------------------ */

const adminTools: Def[] = [
  {
    name: "admin_find_user",
    description: "Find users by email, username, phone or name. Returns ids, wallet balance and status.",
    parameters: obj({ query: S("Search text."), limit: N("Max rows (default 5).") }, ["query"]),
    admin: true,
    run: async (a, c) => {
      const like = `%${a.query}%`;
      const { data } = await c.svc.from("profiles")
        .select("id, full_name, username, email, phone, referral_code, created_at")
        .or(`email.ilike.${like},username.ilike.${like},phone.ilike.${like},full_name.ilike.${like}`)
        .limit(Math.min(Number(a.limit) || 5, 20));
      const ids = (data ?? []).map((u: any) => u.id);
      const { data: wallets } = ids.length
        ? await c.svc.from("wallets").select("user_id, balance").in("user_id", ids)
        : { data: [] as any[] };
      return {
        users: (data ?? []).map((u: any) => ({
          ...u, balance: Number(wallets?.find((w: any) => w.user_id === u.id)?.balance ?? 0),
        })),
      };
    },
  },
  {
    name: "admin_adjust_wallet",
    description: "Credit, debit or set a user's wallet balance. Creates a transaction and notifies the user.",
    parameters: obj({ user_id: S("Target user id."), amount: N("Non-negative amount."), mode: S("credit | debit | set"), reason: S("Audit reason."), ...CONFIRM }, ["user_id", "amount", "mode"]),
    admin: true, sensitive: true, gate: "admin_actions",
    run: async (a, c) => {
      const { data, error } = await c.userClient.rpc("admin_adjust_wallet", {
        _user_id: a.user_id, _amount: Number(a.amount), _mode: a.mode, _reason: a.reason ?? "D4 AI admin action",
      });
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "admin_list_funding",
    description: "List wallet funding requests, newest first. Filter by status.",
    parameters: obj({ status: S("pending | approved | rejected | cancelled"), limit: N("Max rows (default 10).") }),
    admin: true,
    run: async (a, c) => {
      let q = c.svc.from("funding_requests")
        .select("id, user_id, amount, reference, provider, bank, status, receipt_url, created_at")
        .order("created_at", { ascending: false }).limit(Math.min(Number(a.limit) || 10, 25));
      if (a.status) q = q.eq("status", a.status);
      const { data } = await q;
      return { funding_requests: data ?? [] };
    },
  },
  {
    name: "admin_process_funding",
    description: "Approve, reject or cancel a funding request. Approving credits the wallet exactly once.",
    parameters: obj({ id: S("funding_requests.id"), action: S("approve | reject | cancel"), remark: S("Reason / note."), ...CONFIRM }, ["id", "action"]),
    admin: true, sensitive: true, gate: "admin_actions",
    run: async (a, c) => {
      const fn = a.action === "approve" ? "approve_funding" : a.action === "reject" ? "reject_funding" : "cancel_funding";
      const args: any = { _id: a.id };
      args._remark = a.remark ?? `${a.action} via D4 AI`;
      const { error } = await c.userClient.rpc(fn, args);
      if (error) throw new Error(error.message);
      try { await callFn(c, "telegram-notify", { action: "funding_admin_action", funding_id: a.id, status: a.action, admin: c.email }); } catch { /* non-fatal */ }
      return { ok: true, id: a.id, status: a.action };
    },
  },
  {
    name: "admin_review_receipt",
    description: "AI review of a funding receipt: checks duplicates, amount mismatch and suspicious signals, and returns a confidence verdict. Does not approve on its own unless you then call admin_process_funding.",
    parameters: obj({ funding_id: S("funding_requests.id") }, ["funding_id"]),
    admin: true, gate: "receipt_review",
    run: async (a, c) => {
      const { data: f } = await c.svc.from("funding_requests").select("*").eq("id", a.funding_id).maybeSingle();
      if (!f) throw new Error("Funding request not found.");
      const signals: string[] = [];
      let score = 0.5;
      if (!f.receipt_url) { signals.push("No receipt uploaded"); score -= 0.3; }
      const { data: dupes } = await c.svc.from("funding_requests")
        .select("id, status, created_at").eq("user_id", f.user_id).eq("amount", f.amount).neq("id", f.id)
        .gte("created_at", new Date(Date.now() - 3 * 864e5).toISOString());
      if (dupes?.length) { signals.push(`${dupes.length} similar request(s) in the last 3 days`); score -= 0.25; }
      const { data: history } = await c.svc.from("funding_requests")
        .select("status").eq("user_id", f.user_id).eq("status", "approved");
      if ((history?.length ?? 0) > 0) { signals.push(`${history!.length} previously approved fundings`); score += 0.25; }
      if (Number(f.amount) > 200000) { signals.push("Unusually large amount"); score -= 0.15; }
      score = Math.max(0, Math.min(1, score));
      let signed: string | null = null;
      if (f.receipt_url) {
        const path = String(f.receipt_url).split("/receipts/").pop() ?? f.receipt_url;
        const { data: s } = await c.svc.storage.from("receipts").createSignedUrl(path, 600);
        signed = s?.signedUrl ?? null;
      }
      return {
        funding: { id: f.id, amount: f.amount, status: f.status, reference: f.reference, created_at: f.created_at },
        confidence: Number(score.toFixed(2)),
        verdict: score >= 0.8 ? "likely_genuine" : score <= 0.3 ? "suspicious" : "uncertain",
        signals, receipt_signed_url: signed,
      };
    },
  },
  {
    name: "admin_refund_transaction",
    description: "Refund a debit transaction back to the user's wallet.",
    parameters: obj({ tx_id: S("transactions.id"), reason: S("Refund reason."), ...CONFIRM }, ["tx_id"]),
    admin: true, sensitive: true, gate: "admin_actions",
    run: async (a, c) => {
      const { error } = await c.userClient.rpc("refund_transaction", { _tx_id: a.tx_id, _reason: a.reason ?? "Refunded via D4 AI" });
      if (error) throw new Error(error.message);
      return { ok: true, tx_id: a.tx_id };
    },
  },
  {
    name: "admin_set_user_status",
    description: "Set a user's account status (active, suspended, blocked, disabled).",
    parameters: obj({ user_id: S("Target user id."), status: S("active | suspended | blocked | disabled"), reason: S("Reason."), ...CONFIRM }, ["user_id", "status"]),
    admin: true, sensitive: true, gate: "admin_actions",
    run: async (a, c) => {
      const { error } = await c.userClient.rpc("set_user_status", {
        _user_id: a.user_id, _status: a.status, _reason: a.reason ?? "Set via D4 AI", _suspended_until: null,
      });
      if (error) throw new Error(error.message);
      return { ok: true, user_id: a.user_id, status: a.status };
    },
  },
  {
    name: "admin_send_notification",
    description: "Send a notification / push to one user, selected users, or everyone. Write the copy yourself when asked.",
    parameters: obj({
      title: S("Notification title."), body: S("Notification body."),
      type: S("promotion | system | security | wallet | maintenance"),
      user_ids: { type: "array", items: { type: "string" }, description: "Empty or omitted = everyone." },
      action_url: S("Deep link, e.g. /wallet."), ...CONFIRM,
    }, ["title", "body"]),
    admin: true, sensitive: true, gate: "notifications",
    run: async (a, c) => {
      const everyone = !a.user_ids || a.user_ids.length === 0;
      if (everyone && !c.settings.bulk_actions) {
        throw new Error("Broadcast to all users is disabled. Enable 'Bulk admin actions' in AI settings.");
      }
      const r = await callFn(c, "broadcast-notification", {
        title: a.title, body: a.body, type: a.type ?? "promotion",
        action_url: a.action_url ?? "/notifications", user_ids: a.user_ids ?? [],
      });
      if (r.status >= 300 || r.data?.success === false) throw new Error(r.data?.error || "Failed to send notification.");
      return { ok: true, recipients: everyone ? "all users" : a.user_ids.length, ...r.data };
    },
  },
  {
    name: "admin_update_plan",
    description: "Update a data plan: selling price, cost price, active state or promo flag.",
    parameters: obj({
      plan_id: S("data_plans.id"), selling_price: N("New selling price."), cost_price: N("New cost price."),
      is_active: B("Enable/disable the plan."), is_promo: B("Mark as promo."), ...CONFIRM,
    }, ["plan_id"]),
    admin: true, sensitive: true, gate: "admin_actions",
    run: async (a, c) => {
      const patch: Record<string, unknown> = {};
      for (const k of ["selling_price", "cost_price", "is_active", "is_promo"]) {
        if (a[k] !== undefined && a[k] !== null) patch[k] = a[k];
      }
      if (!Object.keys(patch).length) throw new Error("Nothing to update.");
      const { data, error } = await c.userClient.from("data_plans").update(patch).eq("id", a.plan_id)
        .select("id, plan_name, network, cost_price, selling_price, is_active, is_promo").single();
      if (error) throw new Error(error.message);
      return { ok: true, plan: data };
    },
  },
  {
    name: "admin_bulk_update_prices",
    description: "Bulk adjust selling prices for a network by a percentage (e.g. +5 or -3).",
    parameters: obj({ network: S("mtn | airtel | glo | 9mobile"), percent: N("Percent change, e.g. -5."), ...CONFIRM }, ["network", "percent"]),
    admin: true, sensitive: true, gate: "bulk_actions",
    run: async (a, c) => {
      const { data: plans } = await c.svc.from("data_plans")
        .select("id, selling_price").ilike("network", `%${a.network}%`).eq("is_active", true);
      if (!plans?.length) throw new Error("No active plans found for that network.");
      const factor = 1 + Number(a.percent) / 100;
      let updated = 0;
      for (const p of plans) {
        const next = Math.round(Number(p.selling_price) * factor * 100) / 100;
        const { error } = await c.userClient.from("data_plans").update({ selling_price: next }).eq("id", p.id);
        if (!error) updated++;
      }
      return { ok: true, network: a.network, percent: a.percent, plans_updated: updated };
    },
  },
  {
    name: "admin_update_setting",
    description: "Update charge, cashback or AI feature settings. table = charge_settings | cashback_settings | ai_settings.",
    parameters: obj({
      table: S("charge_settings | cashback_settings | ai_settings"),
      key: S("service name (charges/cashback) or ai_settings key"),
      value: N("Numeric value for charges/cashback."),
      mode: S("fixed | percent (charge_settings only)"),
      enabled: B("Enable/disable the setting."), ...CONFIRM,
    }, ["table", "key"]),
    admin: true, sensitive: true, gate: "admin_actions",
    run: async (a, c) => {
      const allowed = ["charge_settings", "cashback_settings", "ai_settings"];
      if (!allowed.includes(a.table)) throw new Error("Unsupported settings table.");
      const patch: Record<string, unknown> = {};
      if (a.enabled !== undefined && a.enabled !== null) patch[a.table === "ai_settings" ? "enabled" : "is_active"] = a.enabled;
      if (a.value !== undefined && a.value !== null) patch[a.table === "cashback_settings" ? "percent" : "value"] = a.value;
      if (a.mode && a.table === "charge_settings") patch.mode = a.mode;
      if (!Object.keys(patch).length) throw new Error("Nothing to update.");
      const col = a.table === "ai_settings" ? "key" : "service";
      const { data, error } = await c.userClient.from(a.table).update(patch).eq(col, a.key).select("*").single();
      if (error) throw new Error(error.message);
      return { ok: true, updated: data };
    },
  },
  {
    name: "admin_analytics",
    description: "Platform analytics: revenue, deposits, sales, users, failed transactions and success rate for a period.",
    parameters: obj({ period: S("day | week | month | year | lifetime") }, ["period"]),
    admin: true,
    run: async (a, c) => {
      const days: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
      const since = a.period === "lifetime" ? null : new Date(Date.now() - (days[a.period] ?? 30) * 864e5).toISOString();
      let txq = c.svc.from("transactions").select("type, amount, status, profit, charge");
      let fq = c.svc.from("funding_requests").select("amount, status");
      let uq = c.svc.from("profiles").select("id", { count: "exact", head: true });
      if (since) { txq = txq.gte("created_at", since); fq = fq.gte("created_at", since); uq = uq.gte("created_at", since); }
      const [{ data: txs }, { data: funds }, users] = await Promise.all([txq, fq, uq]);
      const all = txs ?? [];
      const success = all.filter((t: any) => t.status === "success");
      const failed = all.filter((t: any) => t.status === "failed");
      const sales = success.filter((t: any) => !["wallet", "refund", "cashback"].includes(t.type));
      return {
        period: a.period,
        new_users: users.count ?? 0,
        sales_volume: sales.reduce((s: number, t: any) => s + Number(t.amount), 0),
        revenue_profit: success.reduce((s: number, t: any) => s + Number(t.profit ?? 0) + Number(t.charge ?? 0), 0),
        deposits_approved: (funds ?? []).filter((f: any) => f.status === "approved").reduce((s: number, f: any) => s + Number(f.amount), 0),
        deposits_pending: (funds ?? []).filter((f: any) => f.status === "pending").length,
        transactions: all.length,
        failed: failed.length,
        success_rate: all.length ? `${((success.length / all.length) * 100).toFixed(1)}%` : "n/a",
      };
    },
  },
  {
    name: "admin_recent_activity",
    description: "Recent platform activity log entries (signups, logins, purchases, funding).",
    parameters: obj({ limit: N("Max rows (default 15).") }),
    admin: true,
    run: async (a, c) => {
      const { data } = await c.svc.from("activity_logs")
        .select("created_at, user_email, event, category")
        .order("created_at", { ascending: false }).limit(Math.min(Number(a.limit) || 15, 40));
      return { activity: data ?? [] };
    },
  },
];

export const ALL_TOOLS: Def[] = [...userTools, ...adminTools];

export function toolSchemas(isAdmin: boolean) {
  return ALL_TOOLS.filter((t) => (t.admin ? isAdmin : true)).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function runTool(name: string, args: any, c: ToolCtx) {
  const def = ALL_TOOLS.find((t) => t.name === name);
  if (!def) return { error: `Unknown tool ${name}` };

  const log = async (result: any, ok: boolean, error?: string) => {
    try {
      await c.svc.from("ai_action_logs").insert({
        user_id: c.userId, actor_email: c.email, is_admin: c.isAdmin, tool: name,
        input: args ?? {}, result: result ?? {}, success: ok, error: error ?? null,
      });
    } catch { /* logging must never break the action */ }
  };

  try {
    if (def.admin && !c.isAdmin) throw new Error("Admin permission required.");
    if (def.gate && c.settings[def.gate] === false) {
      throw new Error(`This capability is turned off (AI setting: ${def.gate}). An admin can enable it in Admin → AI Control.`);
    }
    if (def.sensitive && c.settings.require_confirmation !== false && args?.confirm !== true) {
      return {
        requires_confirmation: true,
        summary: `Confirm this action: ${name} ${JSON.stringify({ ...args, confirm: undefined })}`,
        instruction: "Show the user exactly what will happen and ask them to confirm. Only re-call this tool with confirm:true after they say yes.",
      };
    }
    const result = await def.run(args ?? {}, c);
    await log(result, true);
    return result;
  } catch (e) {
    const msg = (e as Error).message || "Action failed.";
    await log({}, false, msg);
    return { error: msg };
  }
}
