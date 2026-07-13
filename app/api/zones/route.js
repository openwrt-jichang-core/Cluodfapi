import { NextResponse } from "next/server";
import { listAccounts } from "@/lib/store";
import { listZones } from "@/lib/cloudflare";

export async function GET() {
  const accounts = listAccounts();

  const perAccount = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const zones = await listZones(acc.token);
        return {
          accountId: acc.id,
          accountLabel: acc.label,
          zones,
          error: null,
        };
      } catch (err) {
        return {
          accountId: acc.id,
          accountLabel: acc.label,
          zones: [],
          error: err.message,
        };
      }
    })
  );

  return NextResponse.json({ accounts: perAccount });
}
