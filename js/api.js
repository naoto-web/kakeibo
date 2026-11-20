// api.js — GASとの通信と、アプリのインストール。
// 鍵は公開リポジトリに書かない＝最初の1回だけ「?k=鍵」付きのリンクで開いて、端末に覚えさせる。
var API = (function () {
  var URL = 'https://script.google.com/macros/s/AKfycbwJiSc4vN09GpJrm1kz1-gwyiF8ExPacwJ3Mcz8p4Dx4UkqTGv0NY6fil9R2_cW1bFslg/exec';
  var KEY_NAME = 'kakeibo_app_key';

  function store(name, value) {
    try {
      if (value === undefined) return localStorage.getItem(name);
      if (value === null) { localStorage.removeItem(name); return null; }
      localStorage.setItem(name, value);
    } catch (e) { return null; }
  }

  // ?k=… で開いたら覚えて、アドレス欄からは消す
  (function takeKeyFromUrl() {
    var m = location.search.match(/[?&]k=([0-9a-f]{32})/);
    if (!m) return;
    store(KEY_NAME, m[1]);
    history.replaceState(null, '', location.pathname + location.hash);
  })();

  // 貼り付けた文（リンクごとでも鍵だけでもよい）から鍵を取り出して覚える。取れたら true
  // iPhoneはSafariとホーム画面のアプリで保存場所が別＝ホーム画面のアプリには、リンクを貼り付けて入れる
  function setKeyFrom(text) {
    var m = String(text || '').match(/(?:^|[?&=\s])([0-9a-f]{32})(?:$|[&\s#])/i) || String(text || '').match(/^\s*([0-9a-f]{32})\s*$/i);
    if (!m) return false;
    store(KEY_NAME, m[1].toLowerCase());
    return !!store(KEY_NAME);
  }

  function hasKey() { return !!store(KEY_NAME); }
  function forgetKey() { store(KEY_NAME, null); }

  function call(action, data) {
    var body = { key: store(KEY_NAME), action: action };
    Object.keys(data || {}).forEach(function (k) { body[k] = data[k]; });
    // Content-Type を付けない（text/plain）＝GASへの事前確認（CORS）が起きない
    return fetch(URL, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  // ─── アプリとしてインストール（Androidは beforeinstallprompt を捕まえてボタンから出す） ───
  var installEvent = null, onInstallable = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvent = e;
    if (onInstallable) onInstallable();
  });
  window.addEventListener('appinstalled', function () {
    installEvent = null;
    if (onInstallable) onInstallable();
  });
  function canInstall() { return !!installEvent; }
  function install() {
    if (!installEvent) return;
    installEvent.prompt();
    installEvent.userChoice.then(function () { installEvent = null; if (onInstallable) onInstallable(); });
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function isIos() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  return {
    call: call, hasKey: hasKey, forgetKey: forgetKey, setKeyFrom: setKeyFrom,
    canInstall: canInstall, install: install, isStandalone: isStandalone, isIos: isIos,
    onInstallable: function (f) { onInstallable = f; }
  };
})();
