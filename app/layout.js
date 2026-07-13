import "./globals.css";

export const metadata = {
  title: "云控台 · Cloudflare 聚合管理",
  description: "跨账号批量管理 Cloudflare 域名的小云朵代理状态",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
