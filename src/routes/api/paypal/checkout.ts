import { createFileRoute } from "@tanstack/react-router";
import { handleCafeCheckout } from "@/lib/till/cafe-checkout.server";

export const Route = createFileRoute("/api/paypal/checkout")({
  server: {
    handlers: {
      GET: ({ request }) => handleCafeCheckout(request),
      POST: ({ request }) => handleCafeCheckout(request),
    },
  },
});
