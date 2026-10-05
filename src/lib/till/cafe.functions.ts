import { createServerFn } from "@tanstack/react-start";

export const getCafeCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { cafeSupplier } = await import("./cafe.server");
  return cafeSupplier.snapshot();
});

export const setDemoCupsStock = createServerFn({ method: "POST" })
  .validator((input: { cupsInStock: boolean }) => {
    if (typeof input?.cupsInStock !== "boolean") throw new Error("Invalid demo supplier control.");
    return { cupsInStock: input.cupsInStock };
  })
  .handler(async ({ data }) => {
    const { cafeSupplier } = await import("./cafe.server");
    return cafeSupplier.setCupsInStock(data.cupsInStock);
  });

export const replanCafe = createServerFn({ method: "POST" })
  .validator((input: { brief: string }) => ({
    brief: typeof input?.brief === "string" ? input.brief.trim().slice(0, 500) : "",
  }))
  .handler(async ({ data }) => {
    const { proposeCafeRestock } = await import("./cafe.server");
    return proposeCafeRestock(data.brief);
  });
