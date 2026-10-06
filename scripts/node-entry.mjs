import "#nitro/virtual/polyfills";
import { serve } from "srvx/node";
import { useNitroApp as getNitroApp } from "nitro/app";
import { configuredPublicOrigin, pinPublicOrigin } from "./public-origin.mjs";

const origin = configuredPublicOrigin(process.env.PUBLIC_ORIGIN);
if (process.env.RAILWAY_ENVIRONMENT_ID && !origin) {
  throw new Error("Set PUBLIC_ORIGIN to this service's public HTTPS origin.");
}
const port = Number.parseInt(process.env.PORT ?? process.env.NITRO_PORT ?? "3000", 10);
const app = getNitroApp();
// One listener, one process. No cluster or checkout authority in another worker.
serve({
  port,
  hostname: process.env.HOST ?? "0.0.0.0",
  fetch: (request) => app.fetch(pinPublicOrigin(request, origin)),
});
