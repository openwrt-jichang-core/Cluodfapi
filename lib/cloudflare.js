const API_BASE = "https://api.cloudflare.com/client/v4";

// 支持"小云朵"(proxied)开关的记录类型
const PROXIABLE_TYPES = new Set(["A", "AAAA", "CNAME"]);

/**
 * 简单并发限制器,避免瞬间打爆 Cloudflare 的速率限制
 * (官方文档:每个 API Token 大约 1200 次请求 / 5 分钟)
 */
export function createLimiter(concurrency = 4) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 带 429 退避重试的底层请求封装
 */
async function cfFetch(token, path, options = {}, retries = 3) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after")) || 2;
    await sleep(retryAfter * 1000);
    return cfFetch(token, path, options, retries - 1);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data.success === false) {
    const message =
      data?.errors?.map((e) => e.message).join("; ") ||
      `Cloudflare API 请求失败 (HTTP ${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.cfErrors = data?.errors;
    throw err;
  }

  return data;
}

export async function verifyToken(token) {
  const data = await cfFetch(token, "/user/tokens/verify");
  return data.result; // { id, status: 'active' | ... }
}

/**
 * 拉取该账号下所有域名(自动翻页)
 */
export async function listZones(token) {
  const zones = [];
  let page = 1;
  const perPage = 50;

  while (true) {
    const data = await cfFetch(
      token,
      `/zones?page=${page}&per_page=${perPage}`
    );
    zones.push(
      ...data.result.map((z) => ({
        id: z.id,
        name: z.name,
        status: z.status,
        plan: z.plan?.name,
        nameServers: z.name_servers,
      }))
    );
    const { total_pages } = data.result_info;
    if (page >= total_pages) break;
    page++;
  }

  return zones;
}

/**
 * 拉取某个域名下所有 DNS 记录(自动翻页)
 */
export async function listDnsRecords(token, zoneId) {
  const records = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const data = await cfFetch(
      token,
      `/zones/${zoneId}/dns_records?page=${page}&per_page=${perPage}`
    );
    records.push(...data.result);
    const { total_pages } = data.result_info;
    if (page >= total_pages) break;
    page++;
  }

  return records;
}

/**
 * 更新单条记录的 proxied 字段(其余字段原样保留)
 */
async function setRecordProxied(token, zoneId, record, proxied) {
  return cfFetch(token, `/zones/${zoneId}/dns_records/${record.id}`, {
    method: "PUT",
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      proxied,
    }),
  });
}

/**
 * 批量切换某个 zone 下所有可代理记录(A/AAAA/CNAME)的小云朵状态
 * 返回每条记录的处理结果,方便前端展示成功/失败明细
 */
export async function bulkToggleZone(token, zoneId, proxied, limiter) {
  const allRecords = await listDnsRecords(token, zoneId);
  const targets = allRecords.filter((r) => PROXIABLE_TYPES.has(r.type));

  const results = await Promise.all(
    targets.map((record) =>
      limiter(async () => {
        try {
          // 已经是目标状态就跳过,减少不必要的写请求
          if (record.proxied === proxied) {
            return {
              recordId: record.id,
              name: record.name,
              type: record.type,
              skipped: true,
              success: true,
            };
          }
          await setRecordProxied(token, zoneId, record, proxied);
          return {
            recordId: record.id,
            name: record.name,
            type: record.type,
            success: true,
          };
        } catch (err) {
          return {
            recordId: record.id,
            name: record.name,
            type: record.type,
            success: false,
            error: err.message,
          };
        }
      })
    )
  );

  return {
    zoneId,
    total: targets.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
