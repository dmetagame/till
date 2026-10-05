import "@tanstack/react-start/server-only";

const BASE = "https://api-m.sandbox.paypal.com";

export type PayPalOrder = {
  id: string;
  intent?: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: {
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    items?: {
      sku?: string;
      name: string;
      quantity: string;
      unit_amount: { currency_code: string; value: string };
    }[];
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }[];
    };
  }[];
};

export class CheckoutError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function paypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new CheckoutError(
      "PayPal sandbox is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server.",
      503,
    );
  }
  return { clientId, clientSecret };
}

export class PayPalSandboxClient {
  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;
  private readonly credentials: { clientId: string; clientSecret: string };
  private readonly request: typeof fetch;

  constructor(
    credentials: { clientId: string; clientSecret: string },
    request: typeof fetch = fetch,
  ) {
    this.credentials = credentials;
    this.request = request;
  }

  private async json(url: string, init: RequestInit, beforeSend?: () => void): Promise<unknown> {
    let response: Response;
    const options = { ...init, signal: AbortSignal.timeout(25000) };
    // Synchronous and outside the transport catch: guard failures keep their reason.
    beforeSend?.();
    try {
      response = await this.request(url, options);
    } catch {
      throw new CheckoutError(
        "PayPal sandbox request timed out or could not connect. Retry this checkout to check its existing order.",
        502,
      );
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // Only PayPal's documented error fields reach the UI, never request headers or tokens.
      const error = body as {
        name?: string;
        message?: string;
        error?: string;
        error_description?: string;
        debug_id?: string;
        details?: { issue?: string; description?: string }[];
      } | null;
      const details = error?.details
        ?.map((item) => item.issue)
        .filter(Boolean)
        .join(", ");
      throw new CheckoutError(
        [
          `PayPal ${error?.name ?? error?.error ?? `HTTP ${response.status}`}`,
          error?.message ?? error?.error_description,
          details,
          error?.debug_id ? `Debug ID: ${error.debug_id}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        502,
      );
    }
    if (!body || typeof body !== "object") {
      throw new CheckoutError(
        "PayPal returned an unreadable response. No payment status was confirmed.",
        502,
      );
    }
    return body;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = (async () => {
      const body = (await this.json(`${BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      })) as { access_token?: string; expires_in?: number };
      if (!body.access_token || !Number.isFinite(body.expires_in)) {
        throw new CheckoutError("PayPal did not return a valid sandbox access token.", 502);
      }
      this.token = {
        value: body.access_token,
        expiresAt: Date.now() + Math.max(0, body.expires_in! - 60) * 1000,
      };
      return body.access_token;
    })();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  async order(
    path: string,
    method: "GET" | "POST",
    requestId?: string,
    body?: unknown,
    beforeSend?: () => void,
  ) {
    const token = await this.accessToken();
    const result = (await this.json(
      `${BASE}/v2/checkout/orders${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      },
      beforeSend,
    )) as PayPalOrder;
    if (!result.id || !result.status) {
      throw new CheckoutError("PayPal did not return an order ID and status.", 502);
    }
    return result;
  }
}

let client: PayPalSandboxClient | undefined;
export function sandboxClient() {
  return (client ??= new PayPalSandboxClient(paypalCredentials()));
}
