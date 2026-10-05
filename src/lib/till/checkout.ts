// Shared wire types only. Payment credentials and PayPal calls stay on the server.
export type CheckoutCart = {
  checkoutKey: string;
  title: string;
  brief: string;
  budgetCents: number;
  lines: { productId: string; qty: number }[];
  cafeProof?: string;
};

export type PayPalReceipt = {
  orderId: string;
  captureId: string | null;
  orderStatus: string;
  captureStatus: string | null;
  cartVersion: string;
  title: string;
  brief: string;
  budgetCents: number;
  totalCents: number;
  lines: { productId: string; name: string; qty: number; price: number }[];
};
