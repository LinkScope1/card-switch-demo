// /manage 页面由 Nginx 提供，/linkapi/ 由 Nginx 去掉前缀后反向代理到 Core。
// 修改此前缀时，必须同步修改 Nginx 的 location 和 proxy_pass 配置。
window.LINKFORTY_BASE = '/linkapi';
