import { createFileRoute } from "@tanstack/react-router";
import { TillApp } from "@/components/till/till-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TillApp />;
}
