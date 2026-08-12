# card-switch-demo 前端 Nginx 部署

本文只部署前端，不修改 Core 及其 Docker Compose 配置。

## 1. 访问路径

```text
https://links.example.com/manage/              前端页面
https://links.example.com/linkapi/api/links    Core API
https://links.example.com/linkapi/Abc12345     Core 短链接
```

Nginx 将 `/linkapi/` 去掉后转发到 Core：

```text
/linkapi/api/links  -> /api/links
/linkapi/Abc12345   -> /Abc12345
```

## 2. 部署前端文件

```bash
sudo mkdir -p /var/www/card-switch-demo
sudo cp -r card-switch-demo/. /var/www/card-switch-demo/
```

默认代理前缀配置在 `config.js`：

```js
window.LINKFORTY_PUBLIC_PREFIX = '/linkapi';
window.LINKFORTY_API_BASE = '/linkapi';
window.LINKFORTY_SHORTLINK_BASE = '/linkapi';
```

修改 `/linkapi` 时，必须同步修改 Nginx 的 `location`。

## 3. 配置 Nginx

将 `nginx/card-switch-demo.conf` 复制到 Nginx 配置目录：

```bash
sudo cp nginx/card-switch-demo.conf /etc/nginx/sites-available/card-switch-demo
sudo ln -s /etc/nginx/sites-available/card-switch-demo \
  /etc/nginx/sites-enabled/card-switch-demo
```

如果 `links.example.com` 已有 HTTPS 的 `server` 配置，只把模板中的 `/manage`、`/manage/` 和 `/linkapi/` 三个 `location` 合并到现有 `server`，不要重复创建同域名站点。

模板默认将请求代理到本机 Docker 映射端口：

```nginx
proxy_pass http://127.0.0.1:3000/;
```

如果 Core 在其他服务器，可改为其 IP 或独立域名：

```nginx
proxy_pass http://192.168.1.20:3000/;
```

```nginx
proxy_pass https://core.example.com/;
proxy_ssl_server_name on;
proxy_ssl_name core.example.com;
proxy_set_header Host core.example.com;
```

`proxy_pass` 末尾的 `/` 必须保留，否则不会去掉 `/linkapi` 前缀。

检查并加载配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. 配置 HTTPS

将域名解析到 Nginx 服务器后执行：

```bash
sudo certbot --nginx -d links.example.com
```

## 5. 验证

```bash
curl -I https://links.example.com/manage/
curl https://links.example.com/linkapi/health/ready
curl https://links.example.com/linkapi/api/links
```

浏览器打开 `https://links.example.com/manage/`，确认页面加载、链接增删改和短链跳转正常。
