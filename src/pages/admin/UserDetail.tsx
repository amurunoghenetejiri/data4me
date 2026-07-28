import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, LoadingBlock, PageHead, StatusPill, fmtNaira, logAdminAction, maskAcct } from "./_shared";
import { ArrowLeft, Ban, CheckCircle2, MessageSquare, ShieldOff, UserCheck, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminUserDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletMode, setWalletMode] = useState<"set" | "credit" | "debit">("set");
  const [walletReason, setWalletReason] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "user", id],
    enabled: !!id,
    queryFn: async () => {
      const [profile, wallet, status, tx, logins, funding, banks, notes, messages, withdrawals] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("wallets").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("user_status").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("transactions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
        supabase.from("login_activity").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
        supabase.from("funding_requests").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
        supabase.from("bank_details").select("*").eq("user_id", id),
        supabase.from("admin_notes").select("*").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("admin_messages").select("*").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("withdrawals").select("*").eq("user_id", id).order("created_at", { ascending: false }),
      ]);
      return { profile: profile.data, wallet: wallet.data, status: status.data, tx: tx.data || [], logins: logins.data || [], funding: funding.data || [], banks: banks.data || [], notes: notes.data || [], messages: messages.data || [], withdrawals: withdrawals.data || [] };
    },
  });

  async function setBlocked(block: boolean) {
    if (block && !blockReason.trim()) { toast.error("Provide a reason"); return; }
    if (!confirm(block ? "Block this user? They will lose access." : "Unblock this user?")) return;
    const payload: any = { user_id: id, is_blocked: block, block_reason: block ? blockReason : null, blocked_at: block ? new Date().toISOString() : null };
    const { error } = await supabase.from("user_status").upsert(payload, { onConflict: "user_id" });
    if (error) { toast.error(error.message); return; }
    await logAdminAction(supabase, block ? "block_user" : "unblock_user", "user", id, { reason: blockReason });
    toast.success(block ? "User blocked" : "User unblocked");
    setBlockReason("");
    qc.invalidateQueries({ queryKey: ["admin"] });
    refetch();
  }

  async function addNote() {
    if (!noteText.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("admin_notes").insert({ user_id: id, admin_id: user.id, note: noteText });
    if (error) { toast.error(error.message); return; }
    setNoteText("");
    toast.success("Note saved");
    refetch();
  }

  async function sendMessage() {
    if (!msgTitle.trim() || !msgBody.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("admin_messages").insert({ user_id: id, admin_id: user.id, title: msgTitle, body: msgBody });
    if (error) { toast.error(error.message); return; }
    await supabase.from("notifications").insert({ user_id: id, title: msgTitle, body: msgBody });
    await logAdminAction(supabase, "send_message", "user", id, { title: msgTitle });
    setMsgTitle(""); setMsgBody("");
    toast.success("Message sent");
    refetch();
  }
  async function adjustWallet() {
    const amount = Number(walletAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid non-negative amount");
      return;
    }
    if (!confirm(
      walletMode === "set"
        ? `Set this user's balance to ₦${amount.toLocaleString()}?`
        : walletMode === "credit"
          ? `Credit ₦${amount.toLocaleString()} to this wallet?`
          : `Debit ₦${amount.toLocaleString()} from this wallet?`
    )) return;

    setWalletSaving(true);
    try {
      const { data: result, error } = await supabase.rpc("admin_adjust_wallet", {
        _user_id: id,
        _amount: amount,
        _mode: walletMode,
        _reason: walletReason.trim() || null,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const r = result as any;
      toast.success(
        r?.unchanged
          ? "Balance unchanged"
          : `Balance updated: ₦\( {Number(r?.old_balance ?? 0).toLocaleString()} → ₦ \){Number(r?.new_balance ?? 0).toLocaleString()}`
      );
      setWalletAmount("");
      setWalletReason("");
      qc.invalidateQueries({ queryKey: ["admin"] });
      refetch();
    } finally {
      setWalletSaving(false);
    }
        }

  if (isLoading || !data) return <LoadingBlock label="Loading user…" />;
  if (!data.profile) return <GlassCard className="p-8 text-center"><p>User not found</p></GlassCard>;

  const p = data.profile;
  const blocked = !!data.status?.is_blocked;

  return (
    <div>
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-3"><ArrowLeft className="h-4 w-4" /> Back to users</Link>
      <PageHead
        title={`@${p.username || "user"}`}
        subtitle={p.email}
        icon={UserCheck}
        actions={<StatusPill status={blocked ? "blocked" : "active"} />}
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <GlassCard className="p-5">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Wallet</p>
          <p className="text-3xl font-bold text-white mt-1">{fmtNaira(data.wallet?.balance || 0)}</p>
          <p className="text-xs text-slate-400 mt-2">Joined {new Date(p.created_at).toLocaleDateString()}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Profile</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            <li><span className="text-slate-500">Phone</span> · {p.phone || "—"}</li>
            <li><span className="text-slate-500">Full name</span> · {p.full_name || "—"}</li>
            <li><span className="text-slate-500">Verified</span> · {data.status?.is_verified ? "Yes" : "No"}</li>
          </ul>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Counters</p>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            <Cnt label="Tx" v={data.tx.length} />
            <Cnt label="Logins" v={data.logins.length} />
            <Cnt label="Deposits" v={data.funding.length} />
          </div>
        </GlassCard>
      </div>

      <Tabs defaultValue="tx" className="space-y-4">
        <TabsList className="bg-slate-900/60 border border-white/10 flex-wrap h-auto">
          {["tx", "logins", "receipts", "banks", "messages", "wallet", "withdrawals", "notes", "danger"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t === "tx" ? "Transactions" : t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="wallet">
          <div className="space-y-4">
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-violet-300" />
                <h3 className="font-semibold text-white">Adjust wallet balance</h3>
              </div>
              <p className="text-sm text-slate-400">
                Current balance: <span className="text-white font-semibold tabular-nums">{fmtNaira(data.wallet?.balance || 0)}</span>
              </p>

              <div className="flex flex-wrap gap-2">
                {(["set", "credit", "debit"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setWalletMode(m)}
                    className={
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize " +
                      (walletMode === m
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20")
                    }
                  >
                    {m === "set" ? "Set balance" : m === "credit" ? "Add (credit)" : "Remove (debit)"}
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Amount (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    placeholder={walletMode === "set" ? "New balance" : "Amount"}
                    className="mt-1 w-full h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Reason (optional)</label>
                  <input
                    value={walletReason}
                    onChange={(e) => setWalletReason(e.target.value)}
                    placeholder="e.g. Bonus, correction, refund"
                    className="mt-1 w-full h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={adjustWallet}
                disabled={walletSaving || !walletAmount}
                className="h-10 px-5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
              >
                {walletSaving ? "Saving…" : walletMode === "set" ? "Set balance" : walletMode === "credit" ? "Credit wallet" : "Debit wallet"}
              </button>
            </GlassCard>

            <GlassCard className="overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Wallet history</p>
              </div>
              <Table headers={["Date", "Type", "Amount", "Description"]}>
                {data.tx.filter((t: any) => t.type === "wallet").map((t: any) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <span className={"text-xs " + (String(t.description || "").includes("(debit)") ? "text-rose-300" : "text-emerald-300")}>
                        {String(t.description || "").includes("(debit)") ? "Debit" : "Credit"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{fmtNaira(t.amount)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">{t.description}</td>
                  </tr>
                ))}
              </Table>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="logins">
          <GlassCard className="overflow-hidden">
            <Table headers={["Time", "Device", "IP", "Status"]}>
              {data.logins.map((l: any) => (
                <tr key={l.id} className="text-slate-300">
                  <td className="px-4 py-2.5 text-xs">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs">{l.user_agent || "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{maskAcct(l.ip)}</td>
                  <td className="px-4 py-2.5"><StatusPill status={l.status || "success"} /></td>
                </tr>
              ))}
            </Table>
          </GlassCard>
        </TabsContent>

        <TabsContent value="receipts">
          <GlassCard className="overflow-hidden">
            <Table headers={["Date", "Amount", "Bank", "Status", "Receipt", "Action"]}>
              {data.funding.map((f: any) => (
                <tr key={f.id} className="text-slate-300">
                  <td className="px-4 py-2.5 text-xs">{new Date(f.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 tabular-nums text-white">{fmtNaira(f.amount)}</td>
                  <td className="px-4 py-2.5 text-xs">{f.bank || f.provider}</td>
                  <td className="px-4 py-2.5"><StatusPill status={f.status} /></td>
                  <td className="px-4 py-2.5 text-xs">{f.receipt_url ? <a className="text-violet-300 hover:underline" href={f.receipt_url} target="_blank" rel="noreferrer">View</a> : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {f.status === "pending" && (
                      <div className="flex justify-end gap-1">
                        <button onClick={async () => { await supabase.from("funding_requests").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", f.id); await supabase.rpc("credit_wallet", { _user_id: id, _amount: f.amount, _reference: f.reference, _description: "Receipt approved" }); await logAdminAction(supabase, "approve_funding", "funding_request", f.id, { amount: f.amount }); toast.success("Approved & credited"); refetch(); }} className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 text-[11px] border border-emerald-500/30">Approve</button>
                        <button onClick={async () => { await supabase.from("funding_requests").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", f.id); await logAdminAction(supabase, "reject_funding", "funding_request", f.id, {}); toast.info("Rejected"); refetch(); }} className="px-2 py-1 rounded bg-rose-500/15 text-rose-300 text-[11px] border border-rose-500/30">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </GlassCard>
        </TabsContent>

        <TabsContent value="banks">
          <GlassCard className="p-5 space-y-3">
            {data.banks.length === 0 ? <p className="text-sm text-slate-400">No saved banks</p> : data.banks.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <p className="text-white font-medium">{b.bank_name}</p>
                  <p className="text-xs text-slate-400">{b.account_name}</p>
                </div>
                <p className="font-mono text-sm text-slate-300">{maskAcct(b.account_number)}</p>
              </div>
            ))}
          </GlassCard>
        </TabsContent>

        <TabsContent value="messages">
          <GlassCard className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} placeholder="Message title" className="h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />
              <button onClick={sendMessage} className="h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center justify-center gap-1"><MessageSquare className="h-4 w-4" /> Send</button>
            </div>
            <textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="Write a private message…" className="w-full min-h-24 px-3 py-2 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />
            <div className="space-y-2 pt-3 border-t border-white/5">
              {data.messages.length === 0 ? <p className="text-sm text-slate-400">No previous messages</p> : data.messages.map((m: any) => (
                <div key={m.id} className="p-3 rounded-lg bg-white/5">
                  <p className="text-sm text-white font-medium">{m.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.body}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{new Date(m.created_at).toLocaleString()} · {m.delivered ? "Delivered" : "Pending"}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="wallet">
          <GlassCard className="overflow-hidden">
            <Table headers={["Date", "Type", "Amount", "Description"]}>
              {data.tx.filter((t: any) => t.type === "wallet").map((t: any) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5"><span className={"text-xs " + (Number(t.amount) >= 0 ? "text-emerald-300" : "text-rose-300")}>{Number(t.amount) >= 0 ? "Credit" : "Debit"}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{fmtNaira(t.amount)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-300">{t.description}</td>
                </tr>
              ))}
            </Table>
          </GlassCard>
        </TabsContent>

        <TabsContent value="withdrawals">
          <GlassCard className="overflow-hidden">
            <Table headers={["Date", "Amount", "Bank", "Account", "Status"]}>
              {data.withdrawals.map((w: any) => (
                <tr key={w.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(w.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{fmtNaira(w.amount)}</td>
                  <td className="px-4 py-2.5 text-xs">{w.bank_name}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{maskAcct(w.account_number)}</td>
                  <td className="px-4 py-2.5"><StatusPill status={w.status} /></td>
                </tr>
              ))}
            </Table>
          </GlassCard>
        </TabsContent>

        <TabsContent value="notes">
          <GlassCard className="p-5 space-y-3">
            <div className="flex gap-2">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add an admin note…" className="flex-1 h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />
              <button onClick={addNote} className="px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium">Save</button>
            </div>
            <div className="space-y-2">
              {data.notes.map((n: any) => (
                <div key={n.id} className="p-3 rounded-lg bg-white/5 text-sm text-slate-200">
                  <p>{n.note}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="danger">
          <GlassCard className="p-5 border-rose-500/30 space-y-4">
            <h3 className="font-semibold text-rose-300 flex items-center gap-2"><ShieldOff className="h-4 w-4" /> Danger zone</h3>
            {blocked ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-300">This user is currently blocked. Reason: <span className="text-rose-300">{data.status?.block_reason || "—"}</span></p>
                <button onClick={() => setBlocked(false)} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Unblock user</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Reason for blocking…" className="w-full h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm" />
                <button onClick={() => setBlocked(true)} className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold flex items-center gap-2"><Ban className="h-4 w-4" /> Block user</button>
              </div>
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Cnt({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg bg-white/5 py-2">
      <p className="text-lg font-bold text-white tabular-nums">{v}</p>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-widest text-slate-500 bg-slate-900/40">
          <tr>{headers.map((h, i) => <th key={i} className={"px-4 py-3 " + (i >= 2 ? "text-left" : "text-left")}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}
