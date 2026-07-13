import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Transaction } from "@/lib/data";
import { useApp } from "@/context/AppContext";
import { CheckCircle2, Download, Printer, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

interface Props {
  tx: Transaction | null;
  onClose: () => void;
}

export function ReceiptDialog({ tx, onClose }: Props) {
  const { user } = useApp();
  if (!tx) return null;

  const rows = [
    ["Transaction ID", tx.reference],
    ["User", user?.username || user?.name || "Guest"],
    ["Phone", tx.phone || user?.phone || "—"],
    ["Service", labelOf(tx)],
    ["Amount", `₦${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
    ["Date", new Date(tx.date).toLocaleString()],
    ["Status", tx.status.toUpperCase()],
  ];
  if (tx.meta) for (const [k, v] of Object.entries(tx.meta)) rows.push([k, String(v)]);

  function download() {
    const body = `DATA4ME RECEIPT\n================\n` + rows.map(([k, v]) => `${k.padEnd(18)}: ${v}`).join("\n") + `\n\nThank you for using Data4Me.`;
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Data4Me-${tx.reference}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  function print() {
    const w = window.open("", "_blank", "width=600,height=720");
    if (!w) return;
    w.document.write(`<title>Receipt ${tx.reference}</title><style>body{font-family:system-ui;padding:32px;color:#111} h1{margin:0;color:#0d8a5b} .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #ddd} .ok{background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:999px;display:inline-block}</style>`);
    w.document.write(`<h1>Data4Me</h1><p>Official receipt</p>`);
    rows.forEach(([k, v]) => w.document.write(`<div class="row"><span>${k}</span><strong>${v}</strong></div>`));
    w.document.write(`<p style="margin-top:24px"><span class="ok">${tx.status.toUpperCase()}</span></p><p>Thank you for choosing Data4Me.</p>`);
    w.document.close(); w.focus(); w.print();
  }

  return (
    <Dialog open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-gradient-primary text-primary-foreground p-6 relative">
          <button onClick={onClose} className="absolute top-3 right-3 opacity-80 hover:opacity-100"><X className="h-5 w-5" /></button>
          <div className="flex items-center gap-1 mb-3"><BrandMark size={36} /><span className="font-bold">Data4Me</span></div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white/20 grid place-items-center"><CheckCircle2 className="h-6 w-6" /></div>
            <div>
              <p className="text-xs opacity-80">Transaction successful</p>
              <p className="text-2xl font-bold">₦{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-dashed border-border py-2">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium text-right break-all">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-4 bg-muted/40 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={download}><Download className="h-4 w-4 mr-2" />Download</Button>
          <Button className="flex-1 bg-gradient-primary" onClick={print}><Printer className="h-4 w-4 mr-2" />Print</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function labelOf(t: Transaction) {
  switch (t.type) {
    case "data": return "Data Bundle";
    case "airtime": return "Airtime Top-up";
    case "wallet": return "Wallet Funding";
    case "transfer": return "Wallet Transfer";
    case "eth": return "ETH → NGN Conversion";
    case "cable": return "Cable TV Subscription";
    case "electricity": return "Electricity Bill";
    default: return t.description;
  }
}