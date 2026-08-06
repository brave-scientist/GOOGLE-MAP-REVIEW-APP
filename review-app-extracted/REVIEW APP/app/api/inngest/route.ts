/**
 * app/api/inngest/route.ts — Inngest endpoint.
 *
 * Serves all registered Inngest functions for the Inngest DevServer (local) and
 * Inngest Cloud (production). The function registry lives in lib/inngest/index.
 */

import { serve } from "inngest/next";
import { inngest, functions } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});