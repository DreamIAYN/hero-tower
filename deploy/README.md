# 国内部署指南

这个项目是零 npm 依赖的 Node.js 服务，部署只需要 Node 22 + 一个能跑长连接的入口。**不建议继续用 Cloudflare Tunnel 承担国内实时对战**，SSE 长连接和首屏都会受跨境链路影响。

## 一句话建议

**买一台大陆轻量云服务器（2 核 2G、5Mbps 左右），Ubuntu 24.04，先用 `http://服务器IP:4317` 直接跑。** 这是延迟最低、改动最小的方案；绑定域名走 80/443 时再按云厂商要求处理 ICP 备案。促销价通常几十到一百多元/年，具体看机房、带宽和活动。

如果不想备案：选**香港/新加坡轻量服务器 + 域名 + Caddy**，关闭 Cloudflare 小黄云，让流量直连服务器。延迟会比大陆高，但通常仍明显好于现在的隧道。

## 方案对比

| 方案 | 延迟 | 域名/HTTPS | 备案 | 适合 |
| --- | --- | --- | --- | --- |
| 大陆轻量云服务器 + 直接 `IP:4317` | 最低，通常 20–60ms | 可先只用 IP | 绑定域名走 80/443 通常需要 ICP 备案 | 最推荐，最快跑起来 |
| 大陆轻量云服务器 + 域名 + Nginx/Caddy | 低 | 需要域名和证书 | 通常需要 ICP 备案 | 正式公开入口 |
| 香港/新加坡轻量云服务器 + 域名 | 中等，通常 40–120ms | 可自动 HTTPS | 不需要大陆 ICP | 不想备案时的折中 |
| 微信云托管/容器服务 | 中等 | 平台提供 | 平台规则为准 | 已有容器/云开发环境 |
| Serverless 函数 | 不确定 | 平台提供 | 平台规则为准 | 不推荐：SSE 容易被超时/缓冲 |
| Cloudflare Tunnel | 高且不稳定 | 有 | 不需要 | 只适合临时演示 |

大陆服务器建议 **2 核 2G、5Mbps 左右**。4 人房间的 SSE 状态广播对上行带宽有持续占用，1–2Mbps 会明显卡顿。

> 备案与接入政策以云厂商和当地要求为准；如果只通过 `IP:端口` 访问，先测试可用性即可。正式公开服务建议完成 ICP 备案，并使用合规域名。

### 为什么不是 Serverless / 免费隧道

- SSE 是长连接：Serverless 函数常见的执行时长、响应缓冲和并发模型会导致状态卡顿或断流。
- 跨境隧道会经历额外中转、限速和缓冲；国内玩家看到的延迟可能从几十毫秒变成数秒。
- 家用宽带 + frp/花生壳也不是不能跑，但公网上行、端口封锁和运营商策略会让体验不稳定；只适合临时演示。

## 最快路径：大陆 VPS + IP:端口

1. 购买 Ubuntu 24.04 轻量应用服务器，安全组放行 `4317/tcp`。
2. 安装 Node 22：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

3. 上传项目（不要传 `shots/`、`.git/`）：

```bash
sudo mkdir -p /opt/tower-souls
sudo useradd --system --home /opt/tower-souls --shell /usr/sbin/nologin tower || true
sudo rsync -av --exclude shots --exclude .git ./ /opt/tower-souls/
sudo chown -R tower:tower /opt/tower-souls
```

4. 先手动启动验证：

```bash
cd /opt/tower-souls
sudo -u tower PORT=4317 HOST=0.0.0.0 node server.js
```

浏览器打开 `http://服务器IP:4317`，确认首页和快速对战正常。

5. 用 systemd 常驻：

```bash
sudo cp deploy/tower-souls.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tower-souls
sudo systemctl status tower-souls --no-pager
```

6. 健康检查：

```bash
curl http://127.0.0.1:4317/api/health
```

7. 房间快照默认保存在 `data/rooms.json`，服务器每 2 秒保存一次，重启后会恢复上一局，客户端会自动重连。部署目录需要让运行用户可写：

```bash
sudo mkdir -p /opt/tower-souls/data
sudo chown -R tower:tower /opt/tower-souls
```

可用 `STATE_FILE=/path/rooms.json` 覆盖存储位置。删除这个文件即可清空所有未结束房间。

## 域名 + HTTPS

### 大陆服务器

- 域名需要能完成 ICP 备案；`.eu.org` 这类域名通常不适合作为大陆备案域名。
- Nginx 方案：把 `deploy/nginx-tower-souls.conf` 复制到 `/etc/nginx/conf.d/`，替换域名和证书，然后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

- 或使用 Caddy：把 `deploy/Caddyfile` 复制到 `/etc/caddy/Caddyfile`，替换域名：

```bash
sudo systemctl reload caddy
```

- 使用 Nginx/Caddy 时，把 systemd 中的 `HOST=0.0.0.0` 改成 `HOST=127.0.0.1`，不要暴露 4317 到公网。

### 香港/新加坡服务器

- 不需要大陆 ICP；域名 A 记录直接指向服务器 IP。
- 建议关闭 Cloudflare 小黄云（改为 DNS only），让流量直接到服务器；否则仍会绕行 Cloudflare。
- 用 Caddy 自动申请 HTTPS 最省事。

## Docker 部署

```bash
docker compose up -d --build
curl http://127.0.0.1:4317/api/health
```

如果前面有 Nginx/Caddy，把 compose 的端口改成 `127.0.0.1:4317:4317`。

房间快照通过命名卷 `tower-data` 持久化到 `/app/data`，容器重建后仍会恢复。

## 关键注意点

- **SSE 不能被缓冲**：Nginx 必须 `proxy_buffering off`；Caddy 必须 `flush_interval -1`。否则页面会几秒才更新一次，看起来像卡死。
- **不要用 CDN 缓存 `/api/stream` 和 `/api/action`**；只缓存静态资源。
- **带宽**：18Hz 状态广播会持续占用上行；4 人房建议至少 5Mbps。
- **不要让 Cloudflare 代理挡在大陆服务器前面**：如果域名在 Cloudflare，先改成 DNS only（灰云），否则国内流量仍可能绕行海外。
- **`eu.org` 域名**：通常不能作为大陆 ICP 备案域名；大陆方案直接用 `IP:4317`，或换成可备案的 `.com/.cn` 域名。香港服务器可以继续用这个域名，但请关闭 Cloudflare 代理。
- **防火墙**：只开放实际使用的端口；反代后关闭 4317 公网入口。
- **进程守护**：使用 systemd 或 `restart: unless-stopped`，不要用裸 `nohup`。
- 公开后建议增加 Cloudflare/云厂商 WAF、限流和房间创建频率限制。

## 静态资源加速（可选）

如果使用大陆域名并已备案，可以把 `public/` 下的 CSS/JS/字体上传到阿里云 OSS / 腾讯云 COS + CDN，HTML 和 API/SSE 仍走 VPS。当前 `public/` 只有几 MB，且字体已做子集化，单机直出已经够用，不必一开始就上 CDN。
