(function () {
  var D = null;
  // URLの #jigyo などで最初に開くタブを選べる（動作確認用）
  var tab = (location.hash.match(/^#(home|pending|shikin|jigyo|zandaka|rlist)$/) || [])[1] || 'home';
  var busy = false;
  var picks = {};
  var jigyoSel = 'なおと';
  var jigyoYm = '';

  function $(id) { return document.getElementById(id); }
  // 画面に出す文字。シートの中の「Naoto」（口座名・持ち主・メモ）は、出すときに「なおと」にする（11/20 Naoto指定）
  function esc(s) {
    return attr(String(s == null ? '' : s).replace(/Naoto/g, 'なおと'));
  }
  // 属性に入れる値（口座名などサーバーへ送り返すもの）はそのまま
  function attr(s) {
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
      + '<div class="sub">なおとから届いた「鍵つきのリンク」をこのスマホで1回開くと、使えるようになります。</div></div>';
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
    var h = D.home, s = installCard(), rc = D.receipts;
    if (rc) s += '<div class="cam"><button type="button" data-cam="cam">📷 レシートを撮る</button><button type="button" class="s" data-cam="pick">🖼 写真を選ぶ</button></div>';
    s += '<div class="card"><div class="lbl">' + h.month + '月 これまでに使ったお金（家計）</div>'
      + '<div class="big">' + yen(h.spent) + '<span>円</span></div>'
      + (h.spentCash ? '<div class="sub">カード払い ' + yen(h.spent - h.spentCash) + '円 ＋ 現金など（レシート） ' + yen(h.spentCash) + '円</div>' : '')
      + '<div class="sub">' + h.prevMonth + '月は1か月で ' + yen(h.prevSpent) + '円（' + esc(h.avgLabel) + 'の平均 ' + yen(h.avg3) + '円）</div>'
      + (h.tokubetsu ? '<div class="sub">このほかに旅行・特別費 ' + yen(h.tokubetsu) + '円</div>' : '')
      + '</div>';

    var n = pendingCount();
    if (n > 0) s += '<button type="button" class="alert" data-go="pending"><span>「この支払い何？」が <b>' + n + '件</b> たまっています</span><span>答える ›</span></button>';
    if (rc) s += '<button type="button" class="go" data-go="rlist"><span>🧾 レシート　今月 <b>' + rc.count + '枚</b>'
      + (rc.waiting ? '（読み取り待ち ' + rc.waiting + '枚）' : '') + '</span><span>見る ›</span></button>';

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
      var hasR = rc && t.importId && rc.linked[t.importId];
      s += '<div class="item"' + (hasR ? ' data-rid="' + attr(rc.linked[t.importId]) + '"' : '') + '><div>' + esc(t.desc)
        + (t.sokuho ? '<span class="tag new">速報</span>' : '') + (t.cash ? '<span class="tag cash">現金など</span>' : '')
        + (hasR ? '<span class="tag r">🧾内訳</span>' : '')
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
      s += '<div class="card" data-id="' + attr(p.importId) + '" data-row="' + p.row + '">' + pendingHead(p) + '<div class="btns">';
      D.buttons.forEach(function (b) {
        var on = pick.label === b.label;
        s += '<button type="button" class="btn' + (on ? ' on' : '') + '" data-label="' + attr(b.label) + '"'
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
    ['Naoto事業', 'なおとの事業'],
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
      + '<input class="box" type="text" inputmode="numeric" autocomplete="off" data-kind="' + kind + '" data-key="' + attr(key) + '" placeholder="'
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

  // ─── ④ 事業（なおとの事業／ひょいの事業） ───
  function viewJigyo() {
    if (!D.jigyo) return '<div class="empty">事業のページはまだ準備中です</div>';
    var list = D.jigyo.list, s = '<div class="seg">';
    var j = list.filter(function (x) { return x.id === jigyoSel; })[0] || list[0];
    list.forEach(function (x) {
      s += '<button type="button" data-jigyo="' + attr(x.id) + '"' + (x.id === j.id ? ' class="on"' : '') + '>' + esc(x.mark + ' ' + x.label) + '</button>';
    });
    s += '</div>';

    var cur = j.months.filter(function (m) { return m.ym === D.jigyo.ym; })[0];
    s += '<div class="card"><div class="lbl">' + Number(cur.ym.substring(5, 7)) + '月の利益（売上 − 経費）</div>'
      + '<div class="big' + (cur.rieki < 0 ? ' minus' : '') + '">' + yen(cur.rieki) + '<span>円</span>' + rate(cur.rate) + '</div>'
      + '<div class="kv"><span>売上</span><b>' + yen(cur.uriage) + '</b></div>'
      + '<div class="kv"><span>経費<small>カード ' + yen(cur.card) + ' ＋ カード以外 ' + yen(cur.etc) + '</small></span><b>' + yen(cur.keihi) + '</b></div>';
    if (!cur.uriage && !cur.etc) s += '<div class="sub">今月の売上はまだ入っていません（下の「売上を入れる」から）</div>';
    s += '</div>';

    var t = j.total;
    var range = Number(t.from.substring(5, 7)) + (t.from === t.to ? '' : '〜' + Number(t.to.substring(5, 7))) + '月';
    s += '<div class="card"><div class="lbl">' + j.year + '年の合計（' + range + '）</div>'
      + '<div class="kv"><span>売上</span><b>' + yen(t.uriage) + '</b></div>'
      + '<div class="kv"><span>経費</span><b>' + yen(t.keihi) + '</b></div>'
      + '<div class="kv"><span><b>利益</b></span><b' + (t.rieki < 0 ? ' class="minus"' : '') + '>' + yen(t.rieki)
      + (t.rate == null ? '' : '　<span class="pct">' + t.rate + '%</span>') + '</b></div></div>';

    var shown = j.months.filter(function (m) { return m.uriage || m.keihi || m.ym === D.jigyo.ym; });
    var max = Math.max.apply(null, shown.map(function (m) { return Math.max(m.uriage, m.keihi); }).concat([1]));
    s += '<div class="card"><div class="lbl two"><span>月ごと</span><span>右の数字＝利益</span></div>';
    shown.forEach(function (m) {
      s += '<div class="mrow"><span>' + Number(m.ym.substring(5, 7)) + '月</span><div class="mbars">'
        + '<i style="width:' + (m.uriage / max * 100).toFixed(1) + '%"></i><i class="k" style="width:' + (m.keihi / max * 100).toFixed(1) + '%"></i></div>'
        + '<b' + (m.rieki < 0 ? ' class="minus"' : '') + '>' + yen(m.rieki) + '</b></div>';
    });
    s += '<div class="leg"><span><i></i>売上</span><span><i class="k"></i>経費</span></div></div>';

    s += '<div class="card"><div class="lbl" style="margin-bottom:4px">経費の中身（' + j.year + '年の合計）</div>';
    j.kamoku.forEach(function (k) {
      s += '<div class="kv"><span>' + esc(k.kamoku) + '<small>カード払い・' + k.count + '件</small></span><b>' + yen(k.amount) + '</b></div>';
    });
    s += '<div class="kv"><span>カード以外の経費<small>下で入れた分</small></span><b>' + yen(t.etc) + '</b></div></div>';

    if (!jigyoYm || D.jigyo.formMonths.indexOf(jigyoYm) === -1) jigyoYm = D.jigyo.ym;
    var e = j.entries[jigyoYm];
    s += '<div class="card"><div class="lbl" style="margin-bottom:2px">売上を入れる（月に1回・合計だけ）</div>'
      + '<div class="field"><div class="n">どの月</div><select class="sel" id="jym">';
    D.jigyo.formMonths.forEach(function (m) {
      s += '<option value="' + m + '"' + (m === jigyoYm ? ' selected' : '') + '>' + ymLabel(m) + (j.entries[m] ? '（入力済み）' : '') + '</option>';
    });
    s += '</select></div>'
      + jfield('uriage', '売上の合計', e ? '入っている額 ' + yen(e.uriage) + '（' + md(e.at) + ' ' + esc(e.by) + '）' : 'まだ入れていません', e ? e.uriage : null)
      + jfield('keihi', 'カード以外の経費', '現金・振込で払った分', e ? e.keihi : null)
      + '<div class="field"><div class="n">メモ</div><input class="box memo" type="text" maxlength="100" data-j="memo" placeholder="'
      + attr(e && e.memo ? e.memo : '例：イベント出店') + '"></div>'
      + '<button type="button" class="save" id="saveJ">保存する</button>'
      + '<div class="sub">空の欄は前に入れた額のままです。同じ月を入れ直すと上書きします。カードで払った経費は自動で入るので、ここには入れません</div></div>';

    s += '<div class="card"><div class="lbl" style="margin-bottom:4px">カードで払った経費（直近）</div>';
    if (!j.recent.length) s += '<div class="sub">まだありません</div>';
    j.recent.forEach(function (r) {
      s += '<div class="kv"><span>' + esc(r.desc) + '<small>' + md(r.date) + ' ・ ' + esc(r.kamoku) + '</small></span><b>' + yen(r.amount) + '</b></div>';
    });
    s += '</div>';
    return s;
  }
  function rate(r) { return r == null ? '' : '<span class="rate">利益率 ' + r + '%</span>'; }
  function jfield(key, label, note, prev) {
    return '<div class="field"><div class="n">' + esc(label) + '<small>' + note + '</small></div>'
      + '<input class="box" type="text" inputmode="numeric" autocomplete="off" data-j="' + key + '" placeholder="' + (prev == null ? '0' : yen(prev)) + '"></div>';
  }
  function saveJigyo() {
    var req = { jigyo: jigyoSel, ym: jigyoYm }, count = 0;
    var boxes = document.querySelectorAll('[data-j]');
    for (var i = 0; i < boxes.length; i++) {
      var k = boxes[i].getAttribute('data-j');
      if (k === 'memo') { var mv = boxes[i].value.replace(/^\s+|\s+$/g, ''); if (mv) { req.memo = mv; count++; } continue; }
      var v = digits(boxes[i].value);
      if (v === '') continue;
      req[k] = Number(v);
      count++;
    }
    if (!count) { toast('金額を入れてください'); return; }
    var btn = $('saveJ');
    btn.disabled = true;
    btn.textContent = '保存しています…';
    call('appSaveJigyo', req, function () { toast(ymLabel(req.ym) + 'の分を記録しました'); });
  }

  // ─── レシート（送る／一覧／1枚の中身） ───
  // draft＝送る前の1枚のレシート（写真は5枚まで＝長いレシートを分けて撮れる）
  var draft = null, rId = '', camFresh = true, rOpen = {}, rPhotos = {};
  var MAX_SIDE = 1800;
  function camButtons() {
    return '<div class="cam"><button type="button" data-cam="cam">📷 レシートを撮る</button><button type="button" class="s" data-cam="pick">🖼 写真を選ぶ</button></div>';
  }
  function viewRnew() {
    if (!draft || !draft.images.length) return '<div class="empty">写真がありません</div>' + camButtons();
    var max = D.receipts.maxPhotos, n = draft.images.length;
    var s = '<div class="card"><div class="lbl two"><span>このレシートの写真 ' + n + '枚（' + max + '枚まで）</span><span>番号＝上からの順</span></div><div class="thumbs">';
    draft.images.forEach(function (b64, i) {
      s += '<div class="th"><img src="data:image/jpeg;base64,' + b64 + '" alt=""><span>' + (i + 1) + '</span><button type="button" data-rm="' + i + '" aria-label="この写真を外す">✕</button></div>';
    });
    s += '</div>';
    if (n < max) s += '<div class="row2"><button type="button" class="more" data-cam="cam">＋ 続きを撮る</button><button type="button" class="more" data-cam="pick">＋ 写真を足す</button></div>'
      + '<div class="sub">長いレシートは、上から順に分けて撮って足してください（同じレシートの続き）</div>';
    s += '<div class="q">何で払った？</div><div class="btns">' + opts('pay', [['カード', 'カード（アメックス）'], ['現金', '現金・PayPayなど']]) + '</div>'
      + '<div class="q">何の買い物？</div><div class="btns">' + opts('kubun', [['家計', '家計'], ['事業', 'なおとの事業'], ['事業(ひょい)', 'ひょいの事業']]) + '</div>'
      + '<div class="q">病院・歯医者・薬局のとき：受診した人</div><div class="btns">' + opts('patient', [['', '病院ではない'], ['なおと', 'なおと'], ['ひょい', 'ひょい']]) + '</div>'
      + '<input class="inp" type="text" id="rHito" maxlength="100" placeholder="ひとこと（なくてもOK　例：実家へのおみやげ）" value="' + attr(draft.hitokoto) + '">'
      + '<button type="button" class="save" id="sendR">送る</button>'
      + '<button type="button" class="link" id="cancelR">やめる（写真を捨てる）</button>'
      + '<div class="sub">送ったあと、1時間以内にクロコが読んで内訳を入れます（PCが起きているとき）。'
      + (draft.pay === '現金' ? '現金などは、読んだあと家計の支出に1行足します。' : 'カードは、同じ金額のカード明細にひもづけます（二重には数えません）。') + '</div></div>';
    return s;
  }
  function opts(name, list) {
    return list.map(function (o) {
      return '<button type="button" class="btn' + (draft[name] === o[0] ? ' on' : '') + '" data-opt="' + name + '" data-val="' + attr(o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('');
  }
  function kubunLabel(k) { return k === '事業' ? 'なおとの事業' : (k === '事業(ひょい)' ? 'ひょいの事業' : '家計'); }
  function receiptTags(r) {
    var t = '';
    if (r.state === '読み取り待ち') t += '<span class="tag wait">⏳読み取り待ち</span>';
    else if (r.state === '読めない') t += '<span class="tag new">読めない</span>';
    else if (r.pay === '現金') t += '<span class="tag cash">現金など</span>';
    else t += r.linked ? '<span class="tag r">カード明細と一致</span>' : '<span class="tag wait">カード明細待ち</span>';
    if (r.check && r.check !== 'OK') t += '<span class="tag new">合計ずれ</span>';
    if (r.kubun !== '家計') t += '<span class="tag">' + kubunLabel(r.kubun) + '</span>';
    if (r.patient) t += '<span class="tag med">🏥' + esc(r.patient) + '</span>';
    return t;
  }
  function viewRlist() {
    var rc = D.receipts, s = camButtons();
    s += '<div class="card"><div class="lbl" style="margin-bottom:4px">' + Number(rc.ym.substring(5, 7)) + '月に買ったもの（レシート' + rc.count + '枚・合計 ' + yen(rc.sum) + '円）</div>';
    if (!rc.bunrui.length) s += '<div class="sub">まだありません。レシートを撮ると、ここに分類ごとの合計が出ます</div>';
    var max = Math.max.apply(null, rc.bunrui.map(function (b) { return b.amount; }).concat([1]));
    rc.bunrui.forEach(function (b) {
      s += '<div class="kv"><span>' + esc(b.bunrui) + '<span class="rbar"><i style="width:' + Math.max(0, b.amount / max * 100).toFixed(1) + '%"></i></span></span><b>' + yen(b.amount) + '</b></div>';
    });
    s += '</div>';
    var iy = rc.iryo;
    if (iy && iy.count) {
      s += '<div class="card"><div class="lbl" style="margin-bottom:4px">' + iy.year + '年の医療費（受診した人を選んだ' + iy.count + '枚）</div>';
      rc.patients.forEach(function (p) {
        if (iy.byPerson[p]) s += '<div class="kv"><span>' + esc(p) + '</span><b>' + yen(iy.byPerson[p]) + '</b></div>';
      });
      s += '<div class="kv"><span><b>合計</b></span><b>' + yen(iy.total) + '</b></div>';
      iy.byPlace.slice(0, 6).forEach(function (pl) {
        s += '<div class="kv"><span>' + esc(pl.store) + '<small>' + esc(pl.patient) + ' ・ ' + pl.count + '回</small></span><b>' + yen(pl.amount) + '</b></div>';
      });
      s += '<div class="sub">保険などで戻ってくる分を引いた1年の医療費が10万円（所得が少ない人は所得の5%）をこえると、確定申告の医療費控除で税金が戻ります</div></div>';
    }
    s += '<div class="card">';
    if (!rc.list.length) s += '<div class="sub">まだありません</div>';
    rc.list.forEach(function (r) {
      var done = r.state === '読み取り済み';
      var title = done ? r.store : (r.state === '読めない' ? '（読めませんでした）' : '（読み取り待ち）');
      var d = done ? md(r.date) + ' ・ ' + r.items.length + '品 ・ ' + r.who
        : md(r.sent) + ' ' + r.sent.substring(11, 16) + 'に送った ・ ' + r.who + ' ・ 写真' + r.photos + '枚';
      s += '<div class="item tap" data-rid="' + attr(r.id) + '"><div>' + esc(title) + receiptTags(r) + '<div class="d">' + esc(d) + '</div></div>'
        + '<div class="a">' + (done ? yen(r.total) : '—') + ' ›</div></div>';
    });
    return s + '</div><div class="sub center">先月と今月の分を出しています</div>';
  }
  function viewRone() {
    var r = D.receipts.list.filter(function (x) { return x.id === rId; })[0];
    if (!r) return '<div class="empty">このレシートは見つかりません</div><button type="button" class="link" data-go="rlist">‹ レシートの一覧へ</button>';
    var done = r.state === '読み取り済み';
    var s = '<button type="button" class="link" data-go="rlist" style="margin:0 0 6px">‹ レシートの一覧へ</button><div class="card">'
      + '<div class="lbl">' + (done ? md(r.date) : md(r.sent) + 'に送った') + ' ・ ' + esc(r.who) + ' ・ ' + (r.pay === '現金' ? '現金など' : 'カード') + ' ・ ' + kubunLabel(r.kubun) + '</div>';
    if (done) {
      s += '<div class="rhead">' + esc(r.store) + '<b>' + yen(r.total) + '<span>円</span></b></div>' + receiptTags(r).replace(/<span class="tag">[^<]*<\/span>/, '');
      if (r.check && r.check !== 'OK') s += '<div class="warnbox">合計が合いません：' + esc(r.check) + '。読み落としがあるかもしれません（写真を確認）</div>';
      r.items.forEach(function (it) {
        s += '<div class="kv"><span>' + esc(it.name) + '<small>' + esc(it.bunrui) + '</small></span><b' + (it.amount < 0 ? ' class="minus"' : '') + '>' + yen(it.amount) + '</b></div>';
      });
      s += '<div class="sub">明細の科目：' + esc(r.kamoku) + '（' + kubunLabel(r.kubun) + '）' + (r.note ? '<br>クロコのメモ：' + esc(r.note) : '') + '</div>';
    } else if (r.state === '読めない') {
      s += '<div class="warnbox">読めませんでした：' + esc(r.note) + '。消して撮り直してください</div>';
    } else {
      s += '<div class="sub">読み取り待ちです。1時間以内にクロコが読みます（PCが起きているとき）</div>';
    }
    if (r.hitokoto) s += '<div class="sub">ひとこと：' + esc(r.hitokoto) + '</div>';
    // 病院・薬局のレシートなら、受診した人をあとから選べる（医療費控除の集計用）
    var med = r.patient || r.kamoku === '医療費' || r.items.some(function (it) { return it.bunrui === '医療・薬'; });
    if (med) {
      s += '<div class="q">受診した人（医療費控除の集計用）</div><div class="btns">';
      [['', '選ばない'], ['なおと', 'なおと'], ['ひょい', 'ひょい']].forEach(function (o) {
        s += '<button type="button" class="btn' + (r.patient === o[0] ? ' on' : '') + '" data-pat="' + attr(o[0]) + '">' + esc(o[1]) + '</button>';
      });
      s += '</div>';
    }
    s += '<div class="row2" style="margin-top:10px">';
    for (var n = 1; n <= r.photos; n++) {
      s += '<button type="button" class="more" data-rph="' + n + '">' + (rOpen[r.id + '_' + n] ? '写真' + n + 'を閉じる' : '📄 写真' + n + 'を見る') + '</button>';
    }
    s += '</div>';
    for (var k = 1; k <= r.photos; k++) {
      var key = r.id + '_' + k;
      if (!rOpen[key]) continue;
      var p = rPhotos[key];
      s += !p || p.loading ? '<div class="sub">写真' + k + 'を読み込み中…</div>'
        : (p.error ? '<div class="sub">写真' + k + 'を出せませんでした：' + esc(p.error) + '</div>' : '<img class="rphoto" src="data:image/jpeg;base64,' + p.image + '" alt="写真' + k + '">');
    }
    s += '<button type="button" class="link danger" data-rdel="' + attr(r.id) + '">このレシートを消す</button></div>';
    return s;
  }
  // 長い辺を MAX_SIDE まで縮めてJPEGに（スマホの写真は5MB超＝そのままでは重い。レシートの字が読める大きさは残す）
  function shrink(file) {
    function draw(src, w, h) {
      var k = Math.min(1, MAX_SIDE / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.8).split(',')[1];
    }
    function viaImg() {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(draw(img, img.naturalWidth, img.naturalHeight)); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('写真を開けませんでした')); };
        img.src = url;
      });
    }
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .then(function (bmp) { return draw(bmp, bmp.width, bmp.height); })
        .catch(function () { return viaImg(); });
    }
    return viaImg();
  }
  function addFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length || !D || !D.receipts) return;
    if (camFresh || !draft) draft = { images: [], pay: 'カード', kubun: '家計', patient: '', hitokoto: '' };
    var max = D.receipts.maxPhotos, room = max - draft.images.length;
    if (files.length > room) toast('1枚のレシートにつき写真は' + max + '枚までです（' + room + '枚だけ足しました）');
    files = files.slice(0, room);
    if (!files.length) return;
    Promise.all(files.map(shrink)).then(function (list) {
      draft.images = draft.images.concat(list);
      showTab('rnew');
    }).catch(function (err) { toast(err && err.message ? err.message : '写真を開けませんでした'); });
  }
  function onReceiptClick(el) {
    var cam = el.closest ? el.closest('[data-cam]') : null;
    if (cam) {
      camFresh = tab !== 'rnew';
      $(cam.getAttribute('data-cam') === 'cam' ? 'camIn' : 'pickIn').click();
      return true;
    }
    var rr = el.closest ? el.closest('[data-rid]') : null;
    if (rr) { rId = rr.getAttribute('data-rid'); showTab('rone'); return true; }
    if (tab === 'rnew' && draft) {
      if (el.getAttribute('data-rm') != null) { draft.images.splice(Number(el.getAttribute('data-rm')), 1); keepHito(); render(); return true; }
      if (el.getAttribute('data-opt')) { draft[el.getAttribute('data-opt')] = el.getAttribute('data-val'); keepHito(); render(); return true; }
      if (el.id === 'cancelR') {
        if (draft.images.length && !confirm('撮った写真を捨てますか？')) return true;
        draft = null; showTab('home'); return true;
      }
      if (el.id === 'sendR') {
        keepHito();
        el.disabled = true;
        el.textContent = '送っています…';
        call('appReceiptSend', { images: draft.images, pay: draft.pay, kubun: draft.kubun, patient: draft.patient, hitokoto: draft.hitokoto }, function () {
          draft = null;
          toast('送りました。1時間以内にクロコが読みます');
          showTab('home');
        });
        return true;
      }
    }
    if (tab === 'rone') {
      if (el.getAttribute('data-rph')) {
        var key = rId + '_' + el.getAttribute('data-rph'), id = rId, n = Number(el.getAttribute('data-rph'));
        rOpen[key] = !rOpen[key];
        if (rOpen[key] && (!rPhotos[key] || rPhotos[key].error)) {
          rPhotos[key] = { loading: true };
          API.call('appReceiptPhoto', { id: id, n: n }).then(function (res) {
            rPhotos[key] = res && res.ok ? { image: res.image } : { error: res && res.error ? res.error : '読み込めませんでした' };
            if (tab === 'rone') render();
          }).catch(function (err) { rPhotos[key] = { error: err.message }; if (tab === 'rone') render(); });
        }
        render();
        return true;
      }
      if (el.getAttribute('data-pat') != null) {
        var cur = D.receipts.list.filter(function (x) { return x.id === rId; })[0];
        var np = el.getAttribute('data-pat');
        if (cur && cur.patient === np) return true;
        call('appReceiptPatient', { id: rId, patient: np }, function () { toast(np ? '受診した人を「' + np + '」にしました' : '受診した人を外しました'); });
        return true;
      }
      if (el.getAttribute('data-rdel')) {
        var target = D.receipts.list.filter(function (x) { return x.id === rId; })[0];
        if (!confirm('このレシートを消しますか？' + (target && target.pay === '現金' ? '（現金で足した家計の1行も消えます）' : ''))) return true;
        call('appReceiptDelete', { id: el.getAttribute('data-rdel') }, function () { toast('消しました'); showTab('rlist'); });
        return true;
      }
    }
    return false;
  }
  function keepHito() { var h = $('rHito'); if (h && draft) draft.hitokoto = h.value.replace(/^\s+|\s+$/g, ''); }
  // URLの #r=レシートID で、そのレシートを直接開く（動作確認用）
  var hashR = location.hash.match(/^#r=([0-9A-Za-z-]+)$/);
  if (hashR) { rId = hashR[1]; tab = 'rone'; }
  ['camIn', 'pickIn'].forEach(function (id) {
    $(id).addEventListener('change', function () { var f = this.files; addFiles(f); this.value = ''; });
  });

  // ─── 画面の切り替え ───
  function render() {
    if (!D) return;
    if (/^r/.test(tab) && !D.receipts) tab = 'home';
    var titles = { home: '家計簿', pending: 'この支払い何？', shikin: '資金繰り', jigyo: '事業', zandaka: '残高を入れる', rnew: 'レシートを送る', rlist: 'レシート', rone: 'レシート' };
    $('title').textContent = titles[tab];
    var n = pendingCount();
    var sub = '';
    if (tab === 'home') sub = md(D.now) + ' ' + String(D.now).substring(11, 16) + ' 更新';
    if (tab === 'pending') sub = n + '件';
    if (tab === 'shikin') sub = D.shikin.残高.いちばん古い記録日 ? '残高は' + md(D.shikin.残高.いちばん古い記録日) + '時点' : '';
    if (tab === 'zandaka') sub = md(D.zandaka.today);
    if (tab === 'jigyo') sub = md(D.now) + ' ' + String(D.now).substring(11, 16) + ' 更新';
    $('topSub').textContent = sub;
    $('badge').hidden = n === 0;
    $('badge').textContent = n;
    var views = { home: viewHome, pending: viewPending, shikin: viewShikin, jigyo: viewJigyo, zandaka: viewZandaka, rnew: viewRnew, rlist: viewRlist, rone: viewRone };
    $('body').innerHTML = views[tab]();
    var hl = /^r/.test(tab) ? 'home' : tab;
    var tabs = $('tabs').querySelectorAll('button');
    for (var i = 0; i < tabs.length; i++) tabs[i].className = tabs[i].getAttribute('data-tab') === hl ? 'on' : '';
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
    if (el.id === 'saveJ') { saveJigyo(); return; }
    if (onReceiptClick(el)) return;
    var jb = el;
    while (jb && jb !== this && !(jb.getAttribute && jb.getAttribute('data-jigyo'))) jb = jb.parentNode;
    if (jb && jb !== this) { jigyoSel = jb.getAttribute('data-jigyo'); render(); return; }
    if (el.id === 'installBtn') { API.install(); return; }
    if (tab === 'pending') onPendingClick(e);
  });
  $('body').addEventListener('input', function (e) {
    if (tab === 'pending') { onPendingInput(e); return; }
    if ((tab === 'zandaka' || tab === 'jigyo') && e.target.className === 'box') {
      var v = digits(e.target.value);
      e.target.value = v === '' ? '' : yen(Number(v));
    }
  });
  $('body').addEventListener('change', function (e) {
    if (tab === 'jigyo' && e.target.id === 'jym') { jigyoYm = e.target.value; render(); }
  });
  // 別のアプリから戻ってきたときに、5分以上たっていたら読み直す
  var loadedAt = Date.now();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && tab !== 'zandaka' && tab !== 'jigyo' && tab !== 'rnew' && Date.now() - loadedAt > 5 * 60 * 1000) { loadedAt = Date.now(); call('appLoad'); }
  });

  call('appLoad');
})();
