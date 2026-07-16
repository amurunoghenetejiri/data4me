import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDownToLine, Check, X, Clock, AlertCircle, Image, FileText, Eye, EyeOff, Zap, Users, Bell } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { EmptyBlock, ErrorBlock, GlassCard, LoadingBlock, PageHead, StatusPill, fmtNaira, logAdminAction } from "./_shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FundingRequest {
  id: string;
  user_id: string;
  amount: number;
  bank: string;
  reference: string;
  receipt_url: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  reviewed_at: string | null;
  note: string | null;
  profile?: { id: string; username: string; email: string };
}

export default function ReceiptQueue() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount-high" | "amount-low">("newest");
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());
  const [previewReceipt, setPreviewReceipt] = useState<FundingRequest | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; receipt: FundingRequest | null }>({ open: false, receipt: null });
  const [rejectReason, setRejectReason] = useState("");

  // Realtime subscription for funding_requests changes
  useEffect(() => {
    const channel = supabase
      .channel("receipt-queue-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "funding_requests" }, (payload) => {
        const newReceipt = payload.new as any;
        if (newReceipt.status === "pending" || filter === "all") {
          toast.info("📬 New funding receipt submitted", { icon: <Bell className="h-5 w-5 text-blue-500" /> });
          qc.invalidateQueries({ queryKey: ["admin", "receipt-queue"] });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "funding_requests" }, (payload) => {
        const updated = payload.new as any;
        // Always update on status change
        qc.invalidateQueries({ queryKey: ["admin", "receipt-queue"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, filter]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "receipt-queue", filter],
    queryFn: async () => {
      let qb = supabase.from("funding_requests").select("*").limit(200);
      if (filter !== "all") qb = qb.eq("status", "pending");
      const { data, error } = await qb.order("created_at", { ascending: false });
      if (error) throw error;

      const ids = Array.from(new Set((data || []).map((d: any) => d.user_id)));
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, username, email").in("id", ids) : { data: [] as any[] };
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));

      let sorted = (data || []).map((d: any) => ({ ...d, profile: map.get(d.user_id) }));

      // Sort
      if (sortBy === "amount-high") sorted.sort((a, b) => Number(b.amount) - Number(a.amount));
      if (sortBy === "amount-low") sorted.sort((a, b) => Number(a.amount) - Number(b.amount));
      if (sortBy === "oldest") sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      return sorted;
    },
  });

  async function approve(r: FundingRequest) {
    const { error: e1 } = await supabase.from("funding_requests").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", r.id);
    if (e1) return toast.error(e1.message);

    // Credit wallet with RPC
    const { error: e2 } = await supabase.rpc("credit_wallet", { 
      _user_id: r.user_id, 
      _amount: r.amount, 
      _reference: r.reference, 
      _description: `Wallet funding approved` 
    });
    if (e2) return toast.error(e2.message);

    // Send notification to user
    const { error: e3 } = await supabase.from("notifications").insert({
      user_id: r.user_id,
      title: "✅ Funding Approved",
      body: `Your ₦${Number(r.amount).toLocaleString()} funding request has been approved. Wallet credited instantly.`,
    });

    await logAdminAction(supabase, "approve_deposit", "funding_request", r.id, { amount: r.amount, user_id: r.user_id });
    toast.success(`✅ Credited ${fmtNaira(r.amount)} to @${r.profile?.username}`);
    setSelectedReceipts((prev) => {
      const next = new Set(prev);
      next.delete(r.id);
      return next;
    });
    qc.invalidateQueries({ queryKey: ["admin"] });
    refetch();
  }

  async function reject(r: FundingRequest, reason: string) {
    if (!reason.trim()) return toast.error("Please provide a rejection reason");

    const { error } = await supabase.from("funding_requests").update({ status: "rejected", reviewed_at: new Date().toISOString(), note: reason }).eq("id", r.id);
    if (error) return toast.error(error.message);

    // Send rejection notification to user
    const { error: e2 } = await supabase.from("notifications").insert({
      user_id: r.user_id,
      title: "❌ Funding Rejected",
      body: `Your ₦${Number(r.amount).toLocaleString()} funding request was rejected. Reason: ${reason}`,
    });

    await logAdminAction(supabase, "reject_deposit", "funding_request", r.id, { reason });
    toast.info("❌ Rejected and user notified");
    setRejectDialog({ open: false, receipt: null });
    setRejectReason("");
    setSelectedReceipts((prev) => {
      const next = new Set(prev);
      next.delete(r.id);
      return next;
    });
    refetch();
  }

  async function bulkApprove() {
    if (selectedReceipts.size === 0) return toast.error("No receipts selected");
    const toApprove = (data || []).filter((r) => selectedReceipts.has(r.id));

    let approved = 0;
    for (const receipt of toApprove) {
      try {
        await approve(receipt);
        approved++;
      } catch (err) {
        console.error("Error approving receipt:", err);
      }
    }
    toast.success(`✅ Approved ${approved}/${toApprove.length} receipt(s)`);
    setSelectedReceipts(new Set());
  }

  const pending = (data || []).filter((r) => r.status === "pending").length;
  const total = (data || []).length;
  const avgAmount = data?.length ? Math.round(data.reduce((s, r) => s + Number(r.amount), 0) / data.length) : 0;
  const totalAmount = data?.length ? data.reduce((s, r) => s + Number(r.amount), 0) : 0;

  return (
    <div>
      <PageHead
        title="Receipt Approval Queue"
        subtitle="Review and approve wallet funding submissions in real-time"
        icon={ArrowDownToLine}
        actions={
          <div className="flex gap-2">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount-high">Highest amount</option>
              <option value="amount-low">Lowest amount</option>
            </select>
            <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="h-10 px-3 rounded-lg bg-slate-800/60 border border-white/10 text-white text-sm">
              <option value="pending">Pending only</option>
              <option value="all">All receipts</option>
            </select>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase">Pending</p>
          <p className="text-2xl font-bold text-white mt-1">{pending}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase">Total Items</p>
          <p className="text-2xl font-bold text-white mt-1">{total}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase">Avg Amount</p>
          <p className="text-lg font-bold text-white mt-1">{fmtNaira(avgAmount)}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase">Total Value</p>
          <p className="text-lg font-bold text-white mt-1">{fmtNaira(totalAmount)}</p>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedReceipts.size > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-violet-400" />
            <span className="text-white font-medium">
              {selectedReceipts.size} selected
            </span>
          </div>
          <div className="flex gap-2">
            <Button onClick={bulkApprove} size="sm" className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30">
              <Check className="h-4 w-4 mr-1" />
              Approve All
            </Button>
            <Button onClick={() => setSelectedReceipts(new Set())} size="sm" variant="outline">
              Clear
            </Button>
          </div>
        </div>
      )}

      <GlassCard className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={(error as any).message} onRetry={() => refetch()} />
        ) : !data?.length ? (
          <EmptyBlock icon={Clock} title="Queue is empty" body="All receipts have been reviewed!" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500 bg-slate-900/40 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left w-8">
                    <input type="checkbox" checked={selectedReceipts.size === data.length && data.length > 0} onChange={(e) => setSelectedReceipts(e.target.checked ? new Set(data.map((r) => r.id)) : new Set())} />
                  </th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Bank</th>
                  <th className="text-left px-4 py-3">Submitted</th>
                  <th className="text-center px-4 py-3">Receipt</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.map((r: FundingRequest) => (
                  <tr key={r.id} className={cn("hover:bg-slate-800/20 transition", r.status !== "pending" && "opacity-60")}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedReceipts.has(r.id)} onChange={(e) => setSelectedReceipts((prev) => { const next = new Set(prev); if (e.target.checked) next.add(r.id); else next.delete(r.id); return next; })} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">@{r.profile?.username || "user"}</p>
                      <p className="text-xs text-slate-400">{r.profile?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white font-semibold">{fmtNaira(r.amount)}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{r.bank}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                      <br />
                      <span className="text-[10px]">{new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.receipt_url ? (
                        <button onClick={() => setPreviewReceipt(r)} className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition">
                          <Eye className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-slate-500 text-xs">No receipt</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => approve(r)} title="Approve" className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/25 transition flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Approve</span>
                          </button>
                          <button onClick={() => setRejectDialog({ open: true, receipt: r })} title="Reject" className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/25 transition flex items-center gap-1">
                            <X className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Reject</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Preview receipt dialog */}
      <Dialog open={!!previewReceipt} onOpenChange={() => setPreviewReceipt(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receipt Preview — {previewReceipt?.profile?.username}</DialogTitle>
            <DialogDescription>{fmtNaira(previewReceipt?.amount || 0)} from {previewReceipt?.bank}</DialogDescription>
          </DialogHeader>
          {previewReceipt?.receipt_url && (
            <div className="space-y-4">
              {previewReceipt.receipt_url.toLowerCase().endsWith(".pdf") ? (
                <iframe src={previewReceipt.receipt_url} className="w-full h-96 rounded-lg border border-white/10" />
              ) : (
                <img src={previewReceipt.receipt_url} alt="Wallet funding receipt preview" className="w-full rounded-lg border border-white/10 max-h-96 object-contain" />
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Amount</p>
                  <p className="font-semibold text-white">{fmtNaira(previewReceipt.amount)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Bank</p>
                  <p className="font-semibold text-white">{previewReceipt.bank}</p>
                </div>
                <div>
                  <p className="text-slate-400">Reference</p>
                  <p className="font-mono text-xs text-white">{previewReceipt.reference}</p>
                </div>
                <div>
                  <p className="text-slate-400">Submitted</p>
                  <p className="text-white">{new Date(previewReceipt.created_at).toLocaleString()}</p>
                </div>
              </div>
              {previewReceipt.status === "pending" && (
                <div className="flex gap-2 pt-4 border-t border-white/10">
                  <Button onClick={() => { setPreviewReceipt(null); approve(previewReceipt); }} className="flex-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30">
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button onClick={() => { setPreviewReceipt(null); setRejectDialog({ open: true, receipt: previewReceipt }); }} className="flex-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30">
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ ...rejectDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Receipt</DialogTitle>
            <DialogDescription>Provide a reason. The user will see this message.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g., Receipt details don't match account name, Amount unclear, Image quality too poor..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-24"
          />
          <div className="flex gap-2">
            <Button onClick={() => setRejectDialog({ open: false, receipt: null })} variant="outline">
              Cancel
            </Button>
            <Button onClick={() => rejectDialog.receipt && reject(rejectDialog.receipt, rejectReason)} className="bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30">
              <X className="h-4 w-4 mr-2" />
              Reject & Notify
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
