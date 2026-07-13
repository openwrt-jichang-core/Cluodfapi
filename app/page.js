"use client";

import { useEffect, useMemo, useState } from "react";

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.5 6.03A5.5 5.5 0 0 0 8.1 4.2 4 4 0 0 0 4.5 8v.06A3.75 3.75 0 0 0 5 15.5h13a4 4 0 0 0 .5-7.97Z" />
    </svg>
  );
}

function CloudToggle({ state }) {
  // state: 'on' | 'off' | 'unknown'
  return (
    <div
      className={`cloud-toggle ${state === "on" ? "on" : ""} ${
        state === "unknown" ? "pending" : ""
      }`}
      title={
        state === "on" ? "已代理(小云朵开启)" : state === "off" ? "未代理(直连)" : "状态未知"
      }
    >
      <CloudIcon />
    </div>
  );
}

export default function Home() {
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const [zoneGroups, setZoneGroups] = useState([]); // [{accountId, accountLabel, zones, error}]
  const [zonesLoading, setZonesLoading] = useState(false);

  // key: `${accountId}:${zoneId}` -> 'on' | 'off' | 'unknown'
  const [zoneState, setZoneState] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

  const keyOf = (accountId, zoneId) => `${accountId}:${zoneId}`;

  async function loadAccounts() {
    setAccountsLoading(true);
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data.accounts || []);
    setAccountsLoading(false);
  }

  async function loadZones() {
    setZonesLoading(true);
    const res = await fetch("/api/zones");
    const data = await res.json();
    setZoneGroups(data.accounts || []);
    setZonesLoading(false);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (accounts.length > 0) loadZones();
    else setZoneGroups([]);
  }, [accounts.length]);

  async function handleAddAccount(e) {
    e.preventDefault();
    setAddError("");
    setAdding(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "添加失败");
        return;
      }
      setLabel("");
      setToken("");
      await loadAccounts();
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveAccount(id) {
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    await loadAccounts();
  }

  const allZoneEntries = useMemo(() => {
    const list = [];
    for (const group of zoneGroups) {
      for (const zone of group.zones) {
        list.push({
          accountId: group.accountId,
          accountLabel: group.accountLabel,
          zone,
        });
      }
    }
    return list;
  }, [zoneGroups]);

  function toggleSelect(accountId, zoneId) {
    const k = keyOf(accountId, zoneId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function selectAll() {
    setSelected(
      new Set(allZoneEntries.map((e) => keyOf(e.accountId, e.zone.id)))
    );
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkToggle(proxied) {
    const targets = allZoneEntries
      .filter((e) => selected.has(keyOf(e.accountId, e.zone.id)))
      .map((e) => ({
        accountId: e.accountId,
        zoneId: e.zone.id,
        zoneName: e.zone.name,
      }));

    if (targets.length === 0) return;

    setBusy(true);
    setZoneState((prev) => {
      const next = { ...prev };
      targets.forEach((t) => {
        next[keyOf(t.accountId, t.zoneId)] = "unknown";
      });
      return next;
    });
    setLog((prev) => [
      `▸ 开始${proxied ? "开启" : "关闭"} ${targets.length} 个域名的小云朵...`,
      ...prev,
    ]);

    try {
      const res = await fetch("/api/bulk-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxied, targets }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLog((prev) => [`✗ 请求失败: ${data.error}`, ...prev]);
        return;
      }

      const nextState = {};
      const lines = [];
      for (const z of data.zoneResults) {
        if (!z.success) {
          lines.push(`✗ ${z.zoneName || z.zoneId}: ${z.error}`);
          continue;
        }
        nextState[keyOf(z.accountId, z.zoneId)] = proxied ? "on" : "off";
        lines.push(
          `✓ ${z.zoneName}: ${z.succeeded}/${z.total} 条记录已${
            proxied ? "开启" : "关闭"
          }云朵${z.failed ? `,${z.failed} 条失败` : ""}`
        );
      }
      setZoneState((prev) => ({ ...prev, ...nextState }));
      setLog((prev) => [
        `▸ 完成: 共 ${data.summary.recordsSucceeded} 条记录成功, ${data.summary.recordsFailed} 条失败`,
        ...lines,
        ...prev,
      ]);
    } finally {
      setBusy(false);
    }
  }

  const totalZones = allZoneEntries.length;
  const onCount = Object.values(zoneState).filter((s) => s === "on").length;

  return (
    <div className="shell">
      <div className="hero">
        <div>
          <div className="eyebrow">Cloudflare 聚合管理</div>
          <h1>云控台</h1>
        </div>
        <div className="hero-stat">
          <div className="num">
            {onCount}
            <span> / {totalZones}</span>
          </div>
          <div className="label">本次会话中已确认开启云朵的域名</div>
        </div>
      </div>

      <div className="panel">
        <h2>账号(API Token)</h2>
        <form className="account-form" onSubmit={handleAddAccount}>
          <input
            placeholder="备注,例如:主账号 / 客户A"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            placeholder="Cloudflare API Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
          />
          <button className="btn" disabled={adding || !token}>
            {adding ? "校验中..." : "绑定账号"}
          </button>
        </form>
        {addError && <div className="error-text">{addError}</div>}

        {!accountsLoading && accounts.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {accounts.map((a) => (
              <span
                key={a.id}
                className="btn"
                style={{ cursor: "default", display: "flex", gap: 8, alignItems: "center" }}
              >
                {a.label}
                <button
                  onClick={() => handleRemoveAccount(a.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--danger)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                  title="移除账号"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        {!accountsLoading && accounts.length === 0 && (
          <div className="empty-state">还没有绑定任何 Cloudflare 账号,先在上方添加一个 API Token</div>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="panel">
          <div className="toolbar">
            <div className="toolbar-left">
              <span>
                已选 <strong>{selected.size}</strong> / {totalZones} 个域名
              </span>
              <button className="btn" onClick={selectAll} disabled={totalZones === 0}>
                全选
              </button>
              <button className="btn" onClick={clearSelection} disabled={selected.size === 0}>
                清空
              </button>
              <button className="btn" onClick={loadZones} disabled={zonesLoading}>
                {zonesLoading ? "同步中..." : "刷新域名列表"}
              </button>
            </div>
            <div className="toolbar-actions">
              <button
                className="btn btn-on"
                disabled={selected.size === 0 || busy}
                onClick={() => bulkToggle(true)}
              >
                ☁ 一键开启所选云朵
              </button>
              <button
                className="btn btn-off"
                disabled={selected.size === 0 || busy}
                onClick={() => bulkToggle(false)}
              >
                ☁ 一键关闭所选云朵
              </button>
            </div>
          </div>

          {zonesLoading && zoneGroups.length === 0 && (
            <div className="empty-state">正在从 Cloudflare 拉取域名...</div>
          )}

          {zoneGroups.map((group) => (
            <div className="account-group" key={group.accountId}>
              <div className="account-group-header">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={group.zones.every((z) =>
                    selected.has(keyOf(group.accountId, z.id))
                  ) && group.zones.length > 0}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      group.zones.forEach((z) => {
                        const k = keyOf(group.accountId, z.id);
                        if (e.target.checked) next.add(k);
                        else next.delete(k);
                      });
                      return next;
                    });
                  }}
                />
                <strong>{group.accountLabel}</strong>
                <span>· {group.zones.length} 个域名</span>
                {group.error && <span className="error-text">同步失败: {group.error}</span>}
              </div>

              {group.zones.map((zone) => {
                const k = keyOf(group.accountId, zone.id);
                return (
                  <div className="zone-row" key={zone.id}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selected.has(k)}
                      onChange={() => toggleSelect(group.accountId, zone.id)}
                    />
                    <CloudToggle state={zoneState[k] || "unknown"} />
                    <span className="name">{zone.name}</span>
                    <span className={`status ${zone.status === "active" ? "active" : ""}`}>
                      {zone.status}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <div className="panel">
          <h2>执行日志</h2>
          <div className="result-log">
            {log.map((line, i) => (
              <div key={i} className={line.startsWith("✓") ? "ok" : line.startsWith("✗") ? "fail" : ""}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
