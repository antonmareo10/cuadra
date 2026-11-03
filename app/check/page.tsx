import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../components/Chrome";
import { LiveRun } from "./LiveRun";

export const metadata: Metadata = {
  title: "Live run · Cuadra",
  description: "Reconcile an invoice, a delivery note and an order live against the Clocked API.",
};

export default function CheckPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <LiveRun />
      </main>
      <SiteFooter />
    </>
  );
}
