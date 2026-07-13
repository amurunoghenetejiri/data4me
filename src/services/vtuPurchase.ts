import { supabase } from "@/integrations/supabase/client";

export type VTUResponse = {
  success: boolean;
  tx_id?: string;
  txId?: string;
  charge?: number;
  total?: number;
  error?: string;
  data?: {
    txId?: string;
    refunded?: boolean;
    provider_status?: number;
  };
  response?: any;
};

function parseFunctionError(message?: string) {
  if (!message) return "";

  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return message;

  try {
    const parsed = JSON.parse(message.slice(jsonStart));
    return parsed?.error || parsed?.message || message;
  } catch {
    return message;
  }
}

/**
 * Purchase airtime via vtu-purchase edge function
 * - Debits wallet server-side (via debit_wallet RPC)
 * - Calls SMEAPI provider
 * - Auto-refunds on failure
 */
export async function buyAirtime(network: string, phone: string, amount: number): Promise<VTUResponse> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("vtu-purchase", {
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
    },
    body: {
      action: "buy-airtime",
      network,
      phone,
      amount,
    },
  });

  if (error) throw new Error(parseFunctionError(error.message) || "Failed to purchase airtime");
  if (!data) throw new Error("No response from server");
  
  return data as VTUResponse;
}

/**
 * Purchase data plan via vtu-purchase edge function
 * - Looks up plan from data_plans table
 * - Debits wallet server-side
 * - Calls SMEAPI provider
 * - Auto-refunds on failure
 */
export async function buyData(planId: string, phone: string): Promise<VTUResponse> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("vtu-purchase", {
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
    },
    body: {
      action: "buy-data",
      plan_id: planId,
      phone,
    },
  });

  if (error) throw new Error(parseFunctionError(error.message) || "Failed to purchase data");
  if (!data) throw new Error("No response from server");
  
  return data as VTUResponse;
}
