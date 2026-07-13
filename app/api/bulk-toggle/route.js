import { NextResponse } from "next/server";
import { getAccount } from "@/lib/store";
import { bulkToggleZone, createLimiter } from "@/lib/cloudflare";

/**
 * body: {
 *   proxied: boolean,               // true=开启云朵 false=关闭云朵
 *   targets: [{ accountId, zoneId, zoneName }, ...]
 * }
 */
export async function POST(req) {
  const body = await req.json();
  const { proxied, targets } = body;

  if (typeof proxied !== "boolean" || !Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json(
      { error: "参数错误: 需要 proxied(boolean) 和 targets(非空数组)" },
      { status: 400 }
    );
  }

  // 每个账号(Token)各自一个并发限制器,避免不同账号互相挤占,
  // 也避免单账号并发过高触发 Cloudflare 速率限制
  const limiters = new Map();
  const getLimiter = (accountId) => {
    if (!limiters.has(accountId)) limiters.set(accountId, createLimiter(4));
    return limiters.get(accountId);
  };

  const zoneResults = await Promise.all(
    targets.map(async ({ accountId, zoneId, zoneName }) => {
      const account = getAccount(accountId);
      if (!account) {
        return {
          zoneId,
          zoneName,
          accountId,
          success: false,
          error: "账号不存在或已被删除",
        };
      }
      try {
        const result = await bulkToggleZone(
          account.token,
          zoneId,
          proxied,
          getLimiter(accountId)
        );
        return { zoneName, accountId, ...result, success: true };
      } catch (err) {
        return {
          zoneId,
          zoneName,
          accountId,
          success: false,
          error: err.message,
        };
      }
    })
  );

  const summary = {
    zonesProcessed: zoneResults.length,
    recordsSucceeded: zoneResults.reduce(
      (sum, z) => sum + (z.succeeded || 0),
      0
    ),
    recordsFailed: zoneResults.reduce((sum, z) => sum + (z.failed || 0), 0),
  };

  return NextResponse.json({ summary, zoneResults });
}
