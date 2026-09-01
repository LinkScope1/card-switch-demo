// /manage 页面由 Nginx 提供，/linkapi/ 由 Nginx 去掉前缀后反向代理到 Core。
// 修改此前缀时，必须同步修改 Nginx 的 location 和 proxy_pass 配置。
window.LINKFORTY_PUBLIC_PREFIX = '/linkapi';
window.LINKFORTY_API_BASE = '/linkapi';
window.LINKFORTY_SHORTLINK_BASE = '/linkapi';

// App deep-link configuration used by /manage/app-open.html.
// Keep the scheme values without the trailing "://"; the bridge page adds it.
window.APP_OPEN_CONFIG = {
  iosScheme: 'com.icbc.iphoneclient',
  androidScheme: 'com.icbc.androidclient',
  harmonyScheme: 'com.icbc.harmonyclient',
};
