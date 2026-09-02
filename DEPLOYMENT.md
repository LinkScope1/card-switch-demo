# card-switch-demo 前端 Nginx 部署

本文部署 `card-switch-demo` 静态前端，并由宿主机上的 Nginx 将 `/linkapi/` 反向代理到 Core。Core、PostgreSQL 和 Redis 的部署请先完成项目根目录的 [Core 部署说明](../DEPLOYMENT.md)。

默认场景是前端和 Core 位于同一台 Linux 云服务器，Nginx 运行在宿主机而不是 Docker 容器中。

## 1. 访问路径和端口关系

部署完成后：

```text
http://<PUBLIC_IP>/manage/              前端页面
http://<PUBLIC_IP>/linkapi/health/ready Core 就绪检查
http://<PUBLIC_IP>/linkapi/api/links    Core API
http://<PUBLIC_IP>/linkapi/Abc12345     Core 短链接
```

Nginx 会去掉 `/linkapi/` 前缀后转发：

```text
/linkapi/api/links  -> /api/links
/linkapi/Abc12345   -> /Abc12345
```

必须区分容器端口和宿主机端口。例如：

```text
127.0.0.1:3200 -> 容器内 3000
```

此时：

- Core 容器内部监听 `3000`，不要把 Core 的 `PORT` 改成 `3200`。
- 宿主机上的 Nginx 应代理到 `127.0.0.1:3200`。
- 如果 Docker 映射显示 `127.0.0.1:3000->3000`，Nginx 才使用 `127.0.0.1:3000`。

## 2. 上传并安装前端文件

Core 和 `card-switch-demo` 是两个独立的项目。只部署 Core 不会自动产生前端的 `index.html`。

### 方式 A：在服务器克隆前端仓库

```bash
sudo mkdir -p /opt/linkscope
sudo chown -R "$USER":"$USER" /opt/linkscope
git clone https://github.com/LinkScope1/card-switch-demo.git /opt/linkscope/card-switch-demo
```

如果目录已经存在，先确认它确实是前端项目，不要覆盖未备份的文件：

```bash
ls -la /opt/linkscope/card-switch-demo
```

### 方式 B：从本地电脑上传前端项目

在本地电脑执行，将路径替换为本机项目路径：

```bash
rsync -av --exclude='.git' \
  /path/to/linkscope1/card-switch-demo/ \
  root@<PUBLIC_IP>:/opt/linkscope/card-switch-demo/
```

没有 `rsync` 时可以使用：

```bash
scp -r /path/to/linkscope1/card-switch-demo \
  root@<PUBLIC_IP>:/opt/linkscope/
```

在服务器上验证前端入口文件：

```bash
test -f /opt/linkscope/card-switch-demo/index.html \
  && echo '前端文件已准备好' \
  || { echo '缺少 /opt/linkscope/card-switch-demo/index.html'; exit 1; }
```

安装到 Nginx 静态文件目录：

```bash
sudo mkdir -p /var/www/card-switch-demo
sudo cp -r /opt/linkscope/card-switch-demo/. /var/www/card-switch-demo/
```

设置 Nginx 可读权限：

```bash
sudo chown -R www-data:www-data /var/www/card-switch-demo
sudo find /var/www/card-switch-demo -type d -exec chmod 755 {} \;
sudo find /var/www/card-switch-demo -type f -exec chmod 644 {} \;
```

确认入口文件存在：

```bash
test -f /var/www/card-switch-demo/index.html
ls -l /var/www/card-switch-demo/index.html
```

如果该文件不存在，Nginx 访问目录时可能返回 `403 Forbidden`。这时先重新检查上传路径，不要只重复 reload Nginx。

前端默认代理前缀在 `config.js`：

```js
window.LINKFORTY_BASE = '/linkapi';
```

这些是相对路径，不需要填写公网 IP 或 Core 的端口。修改 `/linkapi` 时，必须同步修改 Nginx 的 `location`。

## 3. 获取 Core 宿主机端口

在服务器上执行：

```bash
cd /opt/linkscope/core
docker compose ps
docker compose port linkforty 3000
```

如果 Compose 服务名不是 `linkforty`，先查看服务名：

```bash
docker compose config --services
```

也可以直接查看运行中的容器：

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

记录 Core 的宿主机端口。例如输出：

```text
127.0.0.1:3200
```

下面 Nginx 配置中的 `3200` 必须替换为你实际看到的宿主机端口。容器内部端口仍然是 `3000`。

## 4. 配置 Nginx

从包含 `card-switch-demo` 目录的项目根目录执行：

```bash
sudo cp card-switch-demo/nginx/card-switch-demo.conf \
  /etc/nginx/sites-available/card-switch-demo
sudo ln -sfn /etc/nginx/sites-available/card-switch-demo \
  /etc/nginx/sites-enabled/card-switch-demo
```

编辑配置：

```bash
sudo nano /etc/nginx/sites-available/card-switch-demo
```

同机部署且 Core 映射为 `127.0.0.1:3200->3000` 时，核心配置应为：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name links.example.com;

    root /var/www/card-switch-demo;
    index index.html;

    location = /manage {
        return 301 /manage/;
    }

    location ^~ /manage/ {
        alias /var/www/card-switch-demo/;
        index index.html;
    }

    location ^~ /linkapi/ {
        proxy_pass http://127.0.0.1:3200/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`proxy_pass` 末尾的 `/` 必须保留，否则 Nginx 不会去掉 `/linkapi` 前缀。

如果 Core 在其他服务器，可以改为其可达地址：

```nginx
proxy_pass http://192.168.1.20:3000/;
```

如果通过 HTTPS 域名代理：

```nginx
proxy_pass https://core.example.com/;
proxy_ssl_server_name on;
proxy_ssl_name core.example.com;
proxy_set_header Host core.example.com;
```

如果已有同域名的 HTTPS `server` 配置，只把 `/manage`、`/manage/` 和 `/linkapi/` 三个 `location` 合并进去，不要为同一域名重复创建站点。

检查并加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 使用公网 IP 临时测试

域名 DNS 生效前，公网 IP 请求不会匹配 `server_name links.example.com`。临时编辑配置：

```bash
sudo nano /etc/nginx/sites-available/card-switch-demo
```

将 `server` 开头改为：

```nginx
listen 80 default_server;
listen [::]:80 default_server;
server_name _;
```

`default_server` 是 Nginx 标记，不是公网 IP，不要将它改成 IP。每个监听地址只能有一个默认站点。先检查现有配置：

```bash
sudo nginx -T | grep -nE 'listen .*default_server|server_name'
```

只有确认 `/etc/nginx/sites-enabled/default` 与本配置冲突时，才停用它：

```bash
sudo unlink /etc/nginx/sites-enabled/default
```

不要无条件删除其他站点配置。检查并加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

确认云安全组和服务器防火墙已放行 `80/tcp`，然后验证：

```bash
curl -i http://<PUBLIC_IP>/manage/
curl -i http://<PUBLIC_IP>/linkapi/health/ready
curl -i http://<PUBLIC_IP>/linkapi/api/links
```

成功标准：

- `/manage/` 返回 `200`，或 `/manage` 返回到 `/manage/` 的 `301`。
- `/linkapi/health/ready` 返回 `200`。
- `/linkapi/api/links` 至少能到达 Core；若接口需要认证或参数，返回业务错误不等同于 Nginx 代理失败。

## 6. 切换到域名和 HTTPS

域名 A 记录指向 Nginx 服务器后，将临时配置恢复为：

```nginx
listen 80;
listen [::]:80;
server_name links.example.com;
```

检查 DNS：

```bash
getent hosts links.example.com
```

确认解析到正确公网 IP 后申请证书：

```bash
sudo certbot --nginx -d links.example.com
```

验证：

```bash
curl -I https://links.example.com/manage/
curl -i https://links.example.com/linkapi/health/ready
```

浏览器打开 `https://links.example.com/manage/`，确认页面加载、API 请求、链接增删改和短链跳转正常。

## 7. 故障排查

### `/manage/` 返回 403

```bash
test -f /var/www/card-switch-demo/index.html
sudo namei -l /var/www/card-switch-demo/index.html
sudo nginx -T | sed -n '/server_name links.example.com/,/^[[:space:]]*}/p'
```

重点确认入口文件存在、父目录可读，并且公网 IP 测试时请求命中了正确的 `server`。

### `/linkapi/` 返回 502 或 connection refused

```bash
docker compose ps
docker ps --format 'table {{.Names}}\t{{.Ports}}'
curl -i http://127.0.0.1:<LINKFORTY_PORT>/health/ready
sudo tail -n 100 /var/log/nginx/error.log
```

确认 Nginx 的 `proxy_pass` 使用宿主机映射端口，而不是盲目使用容器内部端口。

### Core 显示 unhealthy

```bash
docker inspect --format '{{.State.Health.Status}}' core-linkforty-1
docker inspect --format '{{range .State.Health.Log}}{{.Output}}{{end}}' core-linkforty-1
docker logs --tail=200 core-linkforty-1
docker exec core-linkforty-1 wget -S -O- http://127.0.0.1:3000/health/ready
```

健康检查访问的是容器内部 `127.0.0.1:3000`，不是宿主机映射端口。返回 `200` 且数据库、Redis 状态为 `ok` 才表示服务就绪。
