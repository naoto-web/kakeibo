(function () {
  var D = null;
  var tab = 'home';
  var busy = false;
  var picks = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yen(n) {
    if (n == null || n === '' || isNaN(Number(n))) return '—';
    var v = Math.round(Number(n));
    return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function md(d) {
    var m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})/);
    return m ? Number(m[1]) + '/' + Number(m[2]) : String(d || '');
  }
  function ymLabel(ym) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})/);
    return m ? m[1] + '年' + Number(m[2]) + '月' : String(ym || '');
  }
  function pendingCount() {
    return D.pending.filter(function (p) { return !p.answered; }).length;
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ─── サーバーとのやりとり ───
  function call(action, data, onDone) {
    if (busy) return;
    if (!API.hasKey()) { showNoKey('このスマホにはまだ鍵が入っていません。'); return; }
    busy = true;
    $('reload').className = 'spin';
    API.call(action, data).then(function (res) {
      busy = false;
      $('reload').className = '';
      if (res && res.code === 'key') { showNoKey('このスマホの鍵が使えなくなっています。'); return; }
      if (!res || !res.ok) { showError(res && res.error ? res.error : '読み込めませんでした'); return; }
      D = res;
      render();
      if (onDone) onDone(res);
    }).catch(function (err) {
      busy = false;
      $('reload').className = '';
      showError('通信できませんでした。電波のいいところで ↻ を押してください（' + (err && err.message ? err.message : err) + '）');
    });
  }
  function showNoKey(lead) {
    D = null;
    $('body').innerHTML = '<div class="card"><b>' + esc(lead) + '</b>'
      + '<div class="sub">Naotoから届いた「鍵つきのリンク」をこのスマホで1回開くと、使えるようになります。</div></div>';
  }
  function installCard() {
    if (API.isStandalone()) return '';
    if (API.canInstall()) return '<button type="button" class="install" id="installBtn">📲 アプリとしてインストール</button>';
    if (API.isIos()) return '<div class="alert"><span>📲 Safariの共有ボタン →「ホーム画面に追加」でアプリになります</span></div>';
    return '';
  }
  function showError(msg) {
    var box = '<div class="err">' + esc(msg) + '</div>';
    if (!D) { $('body').innerHTML = box; return; }
    render();
    $('body').insertAdjacentHTML('afterbegin', box);
    $('body').scrollTop = 0;
  }

  // ─── ① ホーム ───
  function viewHome() {
    var h = D.home, s = installCard();
    s += '<div class="card"><div class="lbl">' + h.month + '月 これまでに使ったお金（家計・カード払い）</div>'
      + '<div class="big">' + yen(h.spent) + '<span>円</span></div>'
      + '<div class="sub">' + h.prevMonth + '月は1か月で ' + yen(h.prevSpent) + '円（' + esc(h.avgLabel) + 'の平均 ' + yen(h.avg3) + '円）</div>'
      + (h.tokubetsu ? '<div class="sub">このほかに旅行・特別費 ' + yen(h.tokubetsu) + '円</div>' : '')
      + '</div>';

    var n = pendingCount();
    if (n > 0) s += '<button type="button" class="alert" data-go="pending"><span>「この支払い何？」が <b>' + n + '件</b> たまっています</span><span>答える ›</span></button>';

    var over = h.comment ? h.comment.over : '';
    if (h.ai && h.ai.text) {
      s += '<div class="ai"><div class="ait">🤖 ' + esc(h.ai.text) + '</div>'
        + (over ? '<b>' + esc(over) + '</b>' : '')
        + '<small>クロコのひとこと ' + md(h.ai.date) + '</small></div>';
    } else if (h.comment && (h.comment.text || over)) {
      s += '<div class="ai">💡 ' + esc(h.comment.text) + '<b>' + esc(over) + '</b></div>';
    }

    if (h.budgets.length) {
      var max = Math.max.apply(null, h.budgets.map(function (b) { return b.budget; }));
      var dayPct = h.day / h.daysInMonth;
      var left = Math.max(1, h.daysInMonth - h.day);
      s += '<div class="card"><div class="lbl two"><span>' + h.month + '月の予算（棒の長さ＝金額）</span><span>┃＝今日の位置</span></div>';
      h.budgets.forEach(function (b) {
        var track = b.budget / max * 100;
        var fill = Math.max(0, Math.min(100, b.spent / max * 100));
        var over = b.spent > b.budget;
        var warn = !over && b.spent / dayPct > b.budget * 0.95;
        s += '<div class="bg"><div class="bh"><span>' + esc(b.kamoku) + '</span>'
          + (over ? '<span class="ov"><b>' + yen(b.spent - b.budget) + '</b> オーバー</span>' : '<span>あと <b>' + yen(b.budget - b.spent) + '</b></span>')
          + '</div><div class="bb"><s style="width:' + track.toFixed(1) + '%"></s>'
          + '<i class="' + (over ? 'over' : (warn ? 'warn' : '')) + '" style="width:' + fill.toFixed(1) + '%"></i>'
          + '<u style="left:' + (track * dayPct).toFixed(1) + '%"></u></div>'
          + '<div class="bs">' + yen(b.spent) + ' / ' + yen(b.budget)
          + (over ? '' : '　1日あたり ' + yen((b.budget - b.spent) / left) + '円まで') + '</div></div>';
      });
      s += '<div class="sub">予算の金額はまだ仮です（2人で決めたら直します）</div></div>';
    }

    s += '<div class="card"><div class="lbl">直近の利用</div>';
    if (!h.recent.length) s += '<div class="sub">まだありません</div>';
    h.recent.forEach(function (t) {
      s += '<div class="item"><div>' + esc(t.desc) + (t.sokuho ? '<span class="tag new">速報</span>' : '')
        + '<div class="d">' + md(t.date) + (t.time ? ' ' + esc(t.time) : '') + ' ・ ' + esc(t.owner) + ' ・ '
        + esc(t.kamoku === '未分類' ? '確認待ち' : t.kamoku) + '</div></div><div class="a">' + yen(t.amount) + '</div></div>';
    });
    s += '</div>';
    return s;
  }

  // ─── ② 確認待ち ───
  function viewPending() {
    var open = D.pending.filter(function (p) { return !p.answered; });
    var done = D.pending.filter(function (p) { return p.answered; });
    if (!open.length && !done.length) return '<div class="empty">確認待ちはありません 🎉</div>';
    var s = '';
    if (!open.length) s += '<div class="empty">ぜんぶ答え済みです 🎉</div>';
    open.forEach(function (p) {
      var pick = picks[p.importId] || {};
      s += '<div class="card" data-id="' + esc(p.importId) + '" data-row="' + p.row + '">' + pendingHead(p) + '<div class="btns">';
      D.buttons.forEach(function (b) {
        var on = pick.label === b.label;
        s += '<button type="button" class="btn' + (on ? ' on' : '') + '" data-label="' + esc(b.label) + '"'
          + (!b.main && !pick.more && !on ? ' hidden' : '') + '>' + esc(b.label) + '</button>';
      });
      if (!pick.more) s += '<button type="button" class="btn" data-more="1">ほか…</button>';
      s += '</div><input class="inp" type="text" maxlength="200" placeholder="ひとこと（例：帰省のおみやげ）" value="' + esc(pick.text || '') + '">'
        + '<button type="button" class="send"' + (pick.label || pick.text ? '' : ' disabled') + '>答える</button></div>';
    });
    if (done.length) s += '<div class="lbl" style="margin:14px 4px 6px">ひとことで答え済み（科目はクロコが入れます）</div>';
    done.forEach(function (p) {
      s += '<div class="card done">' + pendingHead(p) + '<div class="sub">' + esc(p.hitokoto) + '</div></div>';
    });
    return s;
  }
  function pendingHead(p) {
    return '<div class="ph"><span class="who' + (p.owner === 'ひょい' ? ' h' : '') + '">' + esc(p.owner) + 'のカード</span><span class="lbl">' + md(p.date) + '</span></div>'
      + '<div class="pt"><b>' + esc(p.desc) + '</b><span class="mid">' + yen(p.amount) + '</span></div>';
  }
  function cardOf(el) {
    while (el && !(el.getAttribute && el.getAttribute('data-id'))) el = el.parentNode;
    return el;
  }
  function refreshSend(card) {
    var pick = picks[card.getAttribute('data-id')] || {};
    card.querySelector('.send').disabled = !(pick.label || pick.text);
  }
  function onPendingClick(e) {
    var el = e.target, card = cardOf(el);
    if (!card) return;
    var id = card.getAttribute('data-id');
    var pick = picks[id] || (picks[id] = {});
    if (el.getAttribute('data-more')) {
      pick.more = true;
      var hiddenBtns = card.querySelectorAll('.btn[hidden]');
      for (var i = 0; i < hiddenBtns.length; i++) hiddenBtns[i].hidden = false;
      el.parentNode.removeChild(el);
      return;
    }
    if (el.getAttribute('data-label')) {
      var label = el.getAttribute('data-label');
      pick.label = pick.label === label ? '' : label;
      var btns = card.querySelectorAll('.btn[data-label]');
      for (var j = 0; j < btns.length; j++) btns[j].className = 'btn' + (btns[j].getAttribute('data-label') === pick.label ? ' on' : '');
      refreshSend(card);
      return;
    }
    if (el.className === 'send') {
      el.disabled = true;
      el.textContent = '送っています…';
      call('appAnswer', { row: Number(card.getAttribute('data-row')), importId: id, label: pick.label || '', hitokoto: pick.text || '' }, function () {
        delete picks[id];
        toast('答えを記録しました');
      });
    }
  }
  function onPendingInput(e) {
    var el = e.target, card = cardOf(el);
    if (!card || el.className !== 'inp') return;
    var id = card.getAttribute('data-id');
    var pick = picks[id] || (picks[id] = {});
    pick.text = el.value.replace(/^\s+|\s+$/g, '');
    refreshSend(card);
  }

  // ─── ③ 資金繰り ───
  function viewShikin() {
    var r = D.shikin, u = r.内訳, s = '';
    var sg = String(r.信号 || '');
    var color = sg.indexOf('🔴') !== -1 ? 'red' : (sg.indexOf('🟡') !== -1 ? 'amber' : (sg.indexOf('🟢') !== -1 ? 'green' : 'gray'));
    var word = { red: '赤', amber: '黄', green: '緑', gray: '残高が未登録' }[color];
    var runway = r.生存月数;
    var isNum = typeof runway === 'number';

    s += '<div class="card"><div class="lbl">収入ゼロであと何か月もつか<span class="sig ' + color + '">' + word + (color === 'gray' ? '' : '（線は仮）') + '</span></div>'
      + '<div class="big">' + (runway == null ? '—' : esc(runway)) + (isNum ? '<span>か月</span>' : '') + '</div>';
    if (r.入金後の生存月数 != null) {
      var days = r.入る予定のお金.明細.map(function (i) { return i.入金予定日; }).filter(function (d) { return d; }).sort();
      var first = days[0];
      s += '<div class="sub">' + (first ? md(first) + (days[days.length - 1] === first ? 'の' : 'からの') : '') + '入金 ' + yen(r.入る予定のお金.合計) + '円が入ると ' + r.入金後の生存月数 + 'か月</div>';
    }
    s += '</div>';

    var hantei = String(r.借入の判定 || '').replace(/（線は仮置き）/, '');
    s += '<div class="judge ' + color + '">判定：<b>' + esc(hantei) + '</b><div class="sub">'
      + r.線.yellow + 'か月を切ったら相談、' + r.線.blue + 'か月をこえたら借りない、の仮の線で出しています</div></div>';

    s += '<div class="card"><div class="lbl" style="margin-bottom:4px">使えるお金</div>'
      + '<div class="kv"><span>手元のお金（' + r.残高.口座ごと.length + '口座）</span><b>' + yen(u.手元のお金) + '</b></div>'
      + '<div class="kv"><span>税・年金のために取っておく分</span><b>' + yen(-u.税の引当) + '</b></div>'
      + '<div class="kv"><span><b>使えるお金</b></span><b>' + yen(u.使えるお金) + '</b></div>';
    if (r.税の崖.次の支払い) {
      var nx = r.税の崖.次の支払い;
      s += '<div class="sub">次の支払い：' + esc(ymLabel(nx.支払月)) + ' ' + esc(nx.税目) + ' ' + yen(nx.見込み額) + '円</div>';
    }
    s += '</div>';

    var months = r.対象月 || [];
    var range = months.length ? Number(months[0].substring(5, 7)) + '〜' + Number(months[months.length - 1].substring(5, 7)) + '月の平均' : '平均';
    s += '<div class="card"><div class="lbl" style="margin-bottom:4px">毎月出ていくお金</div>'
      + '<div class="kv"><span>カード払い・ふだんの分（' + range + '）</span><b>' + yen(u.家計支出3ヶ月平均_特別費除く) + '</b></div>';
    [['旅行・特別費（' + range + '）', u.旅行特別費3ヶ月平均], ['確認待ちの分（' + range + '）', u.確認待ち3ヶ月平均], ['ひょいの事業の経費（' + range + '）', u.ひょい事業の経費3ヶ月平均]].forEach(function (x) {
      if (x[1]) s += '<div class="kv"><span>' + esc(x[0]) + '</span><b>' + yen(x[1]) + '</b></div>';
    });
    u.家計簿外固定費.forEach(function (k) {
      s += '<div class="kv"><span>' + esc(k.名前) + '</span><b>' + yen(k.月額) + '</b></div>';
    });
    s += '<div class="kv"><span><b>合計</b></span><b>' + yen(u.実力ベース月支出) + '</b></div></div>';

    if (r.入る予定のお金.明細.length) {
      s += '<div class="card"><div class="lbl" style="margin-bottom:4px">入る予定のお金（まだ手元にない）</div>';
      r.入る予定のお金.明細.forEach(function (i) {
        var late = D.zandaka.today && i.入金予定日 && i.入金予定日 < D.zandaka.today;
        s += '<div class="kv"><span>' + esc(i.内容) + '<small>' + esc(i.相手) + ' ・ ' + md(i.入金予定日) + (late ? ' ・ 予定日を過ぎています' : '') + '</small></span><b>' + yen(i.金額) + '</b></div>';
      });
      s += '<div class="kv"><span><b>合計</b></span><b>' + yen(r.入る予定のお金.合計) + '</b></div></div>';
    }

    if (r.税の崖.明細.length) {
      s += '<div class="card"><div class="lbl" style="margin-bottom:4px">税・年金のために取っておく分の中身</div>';
      r.税の崖.明細.forEach(function (z) {
        s += '<div class="kv"><span>' + esc(z.税目) + '<small>' + esc(ymLabel(z.支払月)) + 'に払う</small></span><b>' + yen(z.見込み額) + '</b></div>';
      });
      s += '</div>';
    }

    if (r.借入.実在.length) {
      s += '<div class="card"><div class="lbl" style="margin-bottom:4px">借入</div>';
      r.借入.実在.forEach(function (k) {
        s += '<div class="kv"><span>' + esc(k.借入先) + 'の' + esc(k.名称) + '<small>毎月 ' + yen(k.毎月の返済) + '円 ・ ' + esc(ymLabel(k.完済予定)) + 'に完済の予定</small></span><b>' + yen(k.残高) + '</b></div>';
      });
      s += '</div>';
    }
    return s;
  }

  // ─── ④ 残高 ───
  var WALLETS = [
    ['家計', '家計'],
    ['Naoto事業', 'Naotoの事業'],
    ['ひょい事業', 'ひょいの事業（何か月もつかの計算には入れない）']
  ];
  function viewZandaka() {
    var z = D.zandaka, s = '';
    var known = WALLETS.map(function (w) { return w[0]; });
    var groups = WALLETS.slice();
    z.koza.forEach(function (k) {
      if (known.indexOf(k.wallet) === -1) { known.push(k.wallet); groups.push([k.wallet, k.wallet]); }
    });
    groups.forEach(function (w) {
      var list = z.koza.filter(function (k) { return k.wallet === w[0]; });
      if (!list.length) return;
      s += '<div class="card"><div class="lbl">' + esc(w[1]) + '</div>';
      list.forEach(function (k) { s += field('koza', k.name, k.name, k.prevDate, k.prevAmount); });
      s += '</div>';
    });
    if (z.kariire.length) {
      s += '<div class="card"><div class="lbl">借入</div>';
      z.kariire.forEach(function (k) { s += field('kariire', k.id, k.name + '残高', k.prevDate, k.prevAmount); });
      s += '</div>';
    }
    s += '<button type="button" class="save" id="saveZ">保存して計算し直す</button>'
      + '<div class="sub center">入れた口座だけ今日（' + md(z.today) + '）の日付で記録します</div>';
    return s;
  }
  function field(kind, key, label, prevDate, prevAmount) {
    return '<div class="field"><div class="n">' + esc(label) + '<small>'
      + (prevAmount == null ? 'まだ記録なし' : '前回 ' + md(prevDate) + '　' + yen(prevAmount)) + '</small></div>'
      + '<input class="box" type="text" inputmode="numeric" autocomplete="off" data-kind="' + kind + '" data-key="' + esc(key) + '" placeholder="'
      + (prevAmount == null ? '0' : yen(prevAmount)) + '"></div>';
  }
  function digits(v) {
    return String(v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[^\d]/g, '');
  }
  function saveZandaka() {
    var boxes = document.querySelectorAll('.box'), req = { koza: {}, kariire: {} }, count = 0;
    for (var i = 0; i < boxes.length; i++) {
      var v = digits(boxes[i].value);
      if (v === '') continue;
      req[boxes[i].getAttribute('data-kind')][boxes[i].getAttribute('data-key')] = Number(v);
      count++;
    }
    if (!count) { toast('金額を入れてください'); return; }
    var btn = $('saveZ');
    btn.disabled = true;
    btn.textContent = '保存しています…';
    call('appSaveZandaka', req, function () {
      toast(count + '件を記録しました');
      showTab('shikin');
    });
  }

  // ─── 画面の切り替え ───
  function render() {
    if (!D) return;
    var titles = { home: '家計簿', pending: 'この支払い何？', shikin: '資金繰り', zandaka: '残高を入れる' };
    $('title').textContent = titles[tab];
    var n = pendingCount();
    var sub = '';
    if (tab === 'home') sub = md(D.now) + ' ' + String(D.now).substring(11, 16) + ' 更新';
    if (tab === 'pending') sub = n + '件';
    if (tab === 'shikin') sub = D.shikin.残高.いちばん古い記録日 ? '残高は' + md(D.shikin.残高.いちばん古い記録日) + '時点' : '';
    if (tab === 'zandaka') sub = md(D.zandaka.today);
    $('topSub').textContent = sub;
    $('badge').hidden = n === 0;
    $('badge').textContent = n;
    var views = { home: viewHome, pending: viewPending, shikin: viewShikin, zandaka: viewZandaka };
    $('body').innerHTML = views[tab]();
    var tabs = $('tabs').querySelectorAll('button');
    for (var i = 0; i < tabs.length; i++) tabs[i].className = tabs[i].getAttribute('data-tab') === tab ? 'on' : '';
  }
  function showTab(name) {
    tab = name;
    render();
    $('body').scrollTop = 0;
  }
  window.showTab = showTab;

  $('tabs').addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== this && !el.getAttribute('data-tab')) el = el.parentNode;
    if (el && el !== this && D) showTab(el.getAttribute('data-tab'));
  });
  $('reload').addEventListener('click', function () { call('appLoad'); });
  API.onInstallable(function () { if (D && tab === 'home') render(); });
  $('body').addEventListener('click', function (e) {
    var el = e.target;
    var go = el;
    while (go && go !== this && !(go.getAttribute && go.getAttribute('data-go'))) go = go.parentNode;
    if (go && go !== this) { showTab(go.getAttribute('data-go')); return; }
    if (el.id === 'saveZ') { saveZandaka(); return; }
    if (el.id === 'installBtn') { API.install(); return; }
    if (tab === 'pending') onPendingClick(e);
  });
  $('body').addEventListener('input', function (e) {
    if (tab === 'pending') { onPendingInput(e); return; }
    if (tab === 'zandaka' && e.target.className === 'box') {
      var v = digits(e.target.value);
      e.target.value = v === '' ? '' : yen(Number(v));
    }
  });
  // 別のアプリから戻ってきたときに、5分以上たっていたら読み直す
  var loadedAt = Date.now();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && tab !== 'zandaka' && Date.now() - loadedAt > 5 * 60 * 1000) { loadedAt = Date.now(); call('appLoad'); }
  });

  call('appLoad');
})();
