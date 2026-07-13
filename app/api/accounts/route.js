import { NextResponse } from "next/server";
import { listAccounts, addAccount, removeAccount } from "@/lib/store";
import { verifyToken } from "@/lib/cloudflare";

export async function GET() {
  const accounts = listAccounts().map(({ token, ...rest }) => rest); // 不把 token 返回给前端
  return NextResponse.json({ accounts });
}

export async function POST(req) {
  const body = await req.json();
  const { label, token } = body;

  if (!token) {
    return NextResponse.json({ error: "缺少 API Token" }, { status: 400 });
  }

  // 提交时先校验 Token 是否有效
  try {
    const result = await verifyToken(token);
    if (result.status !== "active") {
      return NextResponse.json(
        { error: `Token 状态异常: ${result.status}` },
        { status: 400 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Token 校验失败: ${err.message}` },
      { status: 400 }
    );
  }

  const account = addAccount({ label, token });
  const { token: _omit, ...safeAccount } = account;
  return NextResponse.json({ account: safeAccount });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少账号 id" }, { status: 400 });
  }
  removeAccount(id);
  return NextResponse.json({ ok: true });
}
