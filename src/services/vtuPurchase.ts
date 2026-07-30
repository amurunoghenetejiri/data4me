import { supabase } from "@/integrations/supabase/client";

export type VTUResponse = {
  success: boolean;
  tx_id?: string;
  txId?: string;
  charge?: number;
  total?: number;
  cashback?: number;
  error?: string;
  data?: {
    txId?: string;
    refunded?: boolean;
    provider_status?: number;
  };
  response?: any;
};

/** Never show edge-function / HTTP / provider noise to users. */
function userSafeMessage(raw?: string): string {
  const msg = String(raw || "").toLowerCase();
  if (!msg) return "Transaction failed. Please try again.";

  if (msg.includes("insufficient")) {
    return "Insufficient wallet balance. Fund your wallet and try again.";
  }
  if (msg.includes("phone")) {
    return "Enter a valid Nigerian phone number.";
  }
  if (msg.includes("network") && msg.includes("support")) {
    return "Selected network is not supported. Please try another network.";
  }
  if (msg.includes("plan")) {
    return "Selected plan is not available. Please choose another plan.";
  }
  if (
    msg.includes("edge function") ||
    msg.includes("non-2xx") ||
    msg.includes("2xx") ||
    msg.includes("functionshttperror") ||
    msg.includes("functionsrelayerror") ||
    msg.includes("failed to send") ||
    msg.includes("fetch") ||
    msg.includes("networkerror") ||
    msg.includes("http") ||
    msg.includes("status code") ||
    msg.includes("smeapi") ||
    msg.includes("smeplug") ||
    msg.includes("provider") ||
    msg.includes("timeout") ||
    msg.includes("unavailable")
  ) {
    return "Service temporarily unavailable. Please try again later.";
  }
  if (msg.includes("sign in") || msg.includes("auth")) {
    return "Please sign in and try again.";
  }
  // Already a short clean message from the edge function
  if (
    msg.includes("transaction failed") ||
    msg.includes("try again") ||
    msg.includes("fund your wallet") ||
    msg.includes("not available")
  ) {
    return raw!.trim();
  }
  return "Transaction failed. Please try again.";
}

function parseFunctionError(message?: string) {
  if (!message) return "";
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return userSafeMessage(message);
  try {
    const parsed = JSON.parse(message.slice(jsonStart));
    return userSafeMessage(parsed?.error || parsed?.message || message);
  } catch {
    return userSafeMessage(message);
  }
}

export async function buyAirtime(network: string, phone: string, amount: number): Promise<VTUResponse> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) throw new Error("Please sign in and try again.");

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

  if (error) throw new Error(parseFunctionError(error.message));
  if (!data) throw new Error("Transaction failed. Please try again.");

  if (data.success === false) {
    return {
      ...data,
      error: userSafeMessage(data.error),
    } as VTUResponse;
  }

  return data as VTUResponse;
}

export async function buyData(planId: string, phone: string): Promise<VTUResponse> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) throw new Error("Please sign in and try again.");

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

  if (error) throw new Error(parseFunctionError(error.message));
  if (!data) throw new Error("Transaction failed. Please try again.");

  if (data.success === false) {
    return {
      ...data,
      error: userSafeMessage(data.error),
    } as VTUResponse;
  }

  return data as VTUResponse;
}
