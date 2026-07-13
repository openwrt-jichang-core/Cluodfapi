# 云控台 — Cloudflare 聚合管理后台(MVP)

核心功能:**跨账号、批量、一键开关所有域名的"小云朵"(proxied)状态**。

## 功能范围

- 绑定多个 Cloudflare 账号(API Token),提交时自动调用 `/user/tokens/verify` 校验。
- 聚合拉取所有账号下的全部域名(`GET /zones`,自动翻页)。
- 跨账号勾选任意数量的域名,一键"全部开启云朵" / "全部关闭云朵"。
- 后端对每个域名下的 A / AAAA / CNAME 记录逐条调用 `PUT /zones/{zone_id}/dns_records/{id}`,已经是目标状态的记录会自动跳过,减少无效请求。
- 内置并发限制器(每个账号 Token 独立限流,默认并发 4)+ 429 自动退避重试,避免触发 Cloudflare 速率限制(官方限制约 1200 次/5分钟/Token)。
- 执行结果按账号/域名分组展示成功、失败、跳过的记录数。

## 快速开始

```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

## 需要的 Cloudflare Token 权限

创建 API Token 时至少勾选:

- `Zone.Zone` — Read
- `Zone.DNS` — Edit

## 关于账号数据存储

`lib/store.js` 目前用本地 `data/accounts.json` 明文保存 Token,**仅适合本地开发/演示**。上线前请务必:

1. 把 Token 存进数据库并加密(如用 KMS、Vault,或对字段做 AES 加密后再落库)。
2. 不要把 `data/accounts.json` 提交到 Git(已加入 `.gitignore`)。
3. 给这个管理后台本身加上登录鉴权 —— 目前的 API 路由没有做任何权限校验,任何能访问这个 Next.js 服务的人都能读写 Cloudflare 账号。

## 目录结构

```
app/
  page.js              前端主页面(账号管理 + 域名列表 + 批量开关)
  api/accounts/route.js   账号增删查
  api/zones/route.js      跨账号聚合拉取域名
  api/bulk-toggle/route.js 批量切换 proxied
lib/
  cloudflare.js        Cloudflare API 封装(限流 / 重试 / 分页)
  store.js             账号本地持久化(示例实现)
```

## 后续可以扩展的方向

- 每个域名的实时云朵状态展示(目前只在"本次操作后"才知道状态,首次进入是"未知"灰色图标),可以加一个按需拉取 DNS 记录汇总状态的接口。
- 用 WebSocket / SSE 把批量操作的进度实时推送到前端,而不是等全部完成才返回。
- 域名维度的操作日志持久化(目前只在前端内存里,刷新页面就没了)。
- 按 Cache-Tag / URL 清缓存、WAF 规则管理等,可以直接复用 `lib/cloudflare.js` 里的 `cfFetch` 封装继续加接口。
