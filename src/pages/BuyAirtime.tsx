*** Begin Patch
*** Update File: src/pages/BuyAirtime.tsx
@@
-import { PinDialog } from "@/components/PinDialog";
+import { PinDialog } from "@/components/PinDialog";
@@
-import { buyAirtime } from "@/services/vtuPurchase";
+import { buyAirtime, estimateCharge } from "@/services/vtuPurchase";
@@
-  const [pinOpen, setPinOpen] = useState(false);
+  const [pinOpen, setPinOpen] = useState(false);
   const [receipt, setReceipt] = useState<Transaction | null>(null);
   const [processing, setProcessing] = useState(false);
+  const [estimatedCharge, setEstimatedCharge] = useState<number | null>(null);
+  const [estimatedTotal, setEstimatedTotal] = useState<number | null>(null);
@@
-  function attempt() {
+  async function attempt() {
     if (!user) {
       openAuth("login");
       return;
     }
     if (!/^0[789][01]\d{8}$/.test(phone)) {
       toast.error("Enter a valid Nigerian phone number.");
       return;
     }
     if (amount < 50) {
       toast.error("Minimum airtime is ₦50.");
       return;
     }
-
-    // Include an estimated service charge. The backend applies dynamic charges, but
-    // we fallback to a safe default of ₦1 so we don't open the PIN dialog when a
-    // wallet hold would later fail due to the small service charge.
-    const estimatedCharge = 1;
-    const required = amount + estimatedCharge;
-    if (wallet < required) {
-      toast.error(`Insufficient balance. You need ₦${required.toLocaleString()} (plan + charge).`);
-      return;
-    }
-    setPinOpen(true);
+    setProcessing(true);
+    try {
+      const charge = await estimateCharge("airtime", amount).catch(() => 1);
+      const required = amount + (Number(charge) || 1);
+      if (wallet < required) {
+        toast.error(`Insufficient balance. You need ₦${required.toLocaleString()} (plan + charge).`);
+        return;
+      }
+      setEstimatedCharge(Number(charge) || 0);
+      setEstimatedTotal(required);
+      setPinOpen(true);
+    } finally {
+      setProcessing(false);
+    }
   }
@@
   async function confirmBuy() {
     setPinOpen(false);
     if (!user) {
       toast.error("Please sign in and try again.");
       return;
     }
-    if (wallet < amount) {
+    // use estimatedTotal if available for stricter client-side check
+    const checkTotal = estimatedTotal ?? amount;
+    if (wallet < checkTotal) {
       toast.error("Insufficient wallet balance. Fund your wallet and try again.");
       return;
     }
@@
-      const tx = addTransaction({
+      const tx = addTransaction({
         type: "airtime",
         network,
         phone,
         amount: result.total || amount,
         status: "success",
-        description: `${network.toUpperCase()} ₦${amount.toLocaleString()} airtime`,
-        meta: { tx_id: result.tx_id, charge: result.charge },
+        description: `${network.toUpperCase()} ₦${amount.toLocaleString()} airtime`,
+        meta: { tx_id: result.tx_id, charge: result.charge ?? estimatedCharge },
       });
*** End Patch