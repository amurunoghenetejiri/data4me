*** Begin Patch
*** Update File: src/services/vtuPurchase.ts
@@
 export async function buyData(planId: string, phone: string): Promise<VTUResponse> {
@@
 }
+
+export async function estimateCharge(service: string, amount: number): Promise<number> {
+  try {
+    const { data: session } = await supabase.auth.getSession();
+    if (!session?.session?.access_token) throw new Error("Please sign in and try again.");
+    // RPC returns a numeric value (estimate_service_charge)
+    const { data, error } = await supabase.rpc("estimate_service_charge", { _service: service, _amount: amount });
+    if (error) {
+      console.error('[vtuPurchase] estimateCharge rpc error', error.message);
+      return 0;
+    }
+    return Number(data) || 0;
+  } catch (e) {
+    console.error('[vtuPurchase] estimateCharge exception', e);
+    return 0;
+  }
+}
*** End Patch