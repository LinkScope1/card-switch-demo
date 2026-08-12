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

从项目根目录执行，将前端自带的 Nginx 模板复制到配置目录：

```bash
sudo cp card-switch-demo/nginx/card-switch-demo.conf \
  /etc/nginx/sites-available/card-switch-demo
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

## 4. 使用公网 IP 测试

域名生效前，编辑：

```bash
sudo nano /etc/nginx/sites-available/card-switch-demo
```

将：

```nginx
listen 80;
listen [::]:80;
server_name links.example.com;
```

临时改为：

```nginx
listen 80 default_server;
listen [::]:80 default_server;
server_name _;
```

如果 Nginx 默认站点仍启用，先停用其软链接，避免重复的 `default_server`：

```bash
sudo unlink /etc/nginx/sites-enabled/default
```

检查并加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

确认服务器安全组或防火墙已开放 `80/tcp`，然后访问：

```text
http://<PUBLIC_IP>/manage/
http://<PUBLIC_IP>/linkapi/api/links
http://<PUBLIC_IP>/linkapi/Abc12345
```

也可以使用命令验证：

```bash
curl -I http://<PUBLIC_IP>/manage/
curl http://<PUBLIC_IP>/linkapi/health/ready
curl http://<PUBLIC_IP>/linkapi/api/links
```

`config.js` 使用相对路径 `/linkapi`，无需填写公网 IP。

## 5. 切换域名和 HTTPS

域名生效后，将 Nginx 配置恢复为：

```nginx
listen 80;
listen [::]:80;
server_name links.example.com;
```

将域名解析到 Nginx 服务器后执行：

```bash
sudo certbot --nginx -d links.example.com
```

## 6. 验证域名访问

```bash
curl -I https://links.example.com/manage/
curl https://links.example.com/linkapi/health/ready
curl https://links.example.com/linkapi/api/links
```

浏览器打开 `https://links.example.com/manage/`，确认页面加载、链接增删改和短链跳转正常。
