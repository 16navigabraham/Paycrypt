const BASE_URL = "https://wagmicharge-backend.onrender.com"; // your deployed backend URL

export const buyAirtime = async (data: {
  requestId: string;
  phone: string;
  serviceID: string;
  amount?: number;
  variation_code?: string;
}) => {
  const res = await fetch(`${BASE_URL}/api/airtime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to buy airtime");

  return await res.json();
};

export const buyDataSubscription = async (data: {
  requestId: string;
  phone: string;
  serviceID: string;
  variation_code: string;
  amount?: number;
}) => {
  const res = await fetch(`${BASE_URL}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to buy data subscription");

  return await res.json();
};

export const payElectricityBill = async (data: {
  requestId: string;
  meter_number: string;
  serviceID: string;
  variation_code: string;
  amount: number;
  phone: string;
}) => {
  const res = await fetch(`${BASE_URL}/api/electricity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to pay electricity bill");

  return await res.json();
};

export const payTVSubscription = async (data: {
  requestId: string;
  smartcard_number: string;
  serviceID: string;
  variation_code: string;
  amount?: number;
  phone?: string;
}) => {
  const res = await fetch(`${BASE_URL}/api/tv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to pay TV subscription");

  return await res.json();
};

// Optional: Generic order function that can handle all service types
export const submitOrder = async (data: {
  requestId: string;
  crypto: string;
  provider: string;
  plan?: string;
  amount: number;
  cryptoNeeded: number;
  type: 'airtime' | 'data' | 'electricity' | 'tv';
  transactionHash?: string;
  userAddress?: string;
  // Service-specific fields
  phone?: string;
  meter_number?: string;
  smartcard_number?: string;
  variation_code?: string;
  serviceID?: string;
}) => {
  const res = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to submit order");

  return await res.json();
};