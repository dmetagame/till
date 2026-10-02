import { createFileRoute } from "@tanstack/react-router";
import { handleCheckout } from "@/lib/till/checkout.server";

export const Route = createFileRoute("/api/paypal/checkout")({
  server: {
    handlers: {
      GET: ({ request }) => handleCheckout(request),
      POST: ({ request }) => handleCheckout(request),
    },
  },
});
