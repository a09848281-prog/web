/* Face ID Studio - stable camera and registration flow */
(function () {
  'use strict';

  var MODEL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
  var $ = function (id) { return document.getElementById(id); };
  var S = {
    db: null, people: [], history: [], stream: null, regStream: null,
    running: false, busy: false, captureBusy: false, modelsPromise: null,
    samples: [], sessions: 0,
    settings: { threshold: 52, poseEnabled: true, blinkEnabled: true, saveImages: true },
    lastRecords: {}, regStarting: false
  };

  function openDB() {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('face-id-studio-v1', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('people')) d.createObjectStore('people', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = function () { S.db = r.result; S.db.onversionchange = function () { S.db.close(); }; ok(S.db); };
      r.onerror = function () { no(r.error || new Error('IndexedDBを開けません')); };
      r.onblocked = function () { no(new Error('データベースが別タブで使用中です。ほかのタブを閉じて再読み込みしてください')); };
    });
  }
  function getAll(n) {
    return new Promise(function (ok, no) {
      try { var r = S.db.transaction(n).objectStore(n).getAll(); r.onsuccess = function () { ok(r.result || []); }; r.onerror = function () { no(r.error); }; }
      catch (e) { no(e); }
    });
  }
  function put(n, v) {
    return new Promise(function (ok, no) {
      try { var r = S.db.transaction(n, 'readwrite').objectStore(n).put(v); r.onsuccess = function () { ok(); }; r.onerror = function () { no(r.error); }; }
      catch (e) { no(e); }
    });
  }
  function del(n, k) {
    return new Promise(function (ok, no) {
      try { var r = S.db.transaction(n, 'readwrite').objectStore(n).delete(k); r.onsuccess = function () { ok(); }; r.onerror = function () { no(r.error); }; }
      catch (e) { no(e); }
    });
  }
  function clear(n) {
    return new Promise(function (ok, no) {
      try { var r = S.db.transaction(n, 'readwrite').objectStore(n).clear(); r.onsuccess = function () { ok(); }; r.onerror = function () { no(r.error); }; }
      catch (e) { no(e); }
    });
  }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(s) {
    $('toast').textContent = s;
    $('toast').classList.add('show');
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 3200);
  }
  function stamp(t) {
    return new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function role(r) { return ({ admin: '管理者（ローカル）', operator: '操作担当', viewer: '一般' })[r] || '一般'; }

  function initData() {
    return Promise.all([getAll('people'), getAll('meta')]).then(function (a) {
      S.people = a[0];
      var h = a[1].find(function (x) { return x.key === 'history'; });
      S.history = h ? h.value : [];
      var q = a[1].find(function (x) { return x.key === 'sessions'; });
      S.sessions = q ? q.value : 0;
      var z = a[1].find(function (x) { return x.key === 'settings'; });
      if (z) S.settings = Object.assign(S.settings, z.value);
      $('threshold').value = S.settings.threshold;
      $('thresholdValue').textContent = S.settings.threshold + '%';
      $('poseEnabled').checked = S.settings.poseEnabled;
      $('blinkEnabled').checked = S.settings.blinkEnabled;
      $('saveImages').checked = S.settings.saveImages;
      renderAll();
    });
  }
  function historyHTML(h) {
    return '<div class="history-item"><div class="history-main"><div class="avatar">' +
      (h.kind === 'known' ? esc(h.name.charAt(0)) : '?') +
      '</div><div class="person-info"><b>' + esc(h.name) + '</b><small>' +
      (h.kind === 'known' ? '登録済み' : '未登録者') + ' · ' + h.score +
      '%</small></div></div><div class="history-meta">' + stamp(h.at) + '</div></div>';
  }
  function renderHistory() {
    $('historyList').innerHTML = S.history.length ? S.history.map(historyHTML).join('') : '<div class="empty">履歴はありません。</div>';
  }
  function renderDashboard() {
    $('statPeople').textContent = S.people.length;
    $('statSessions').textContent = S.sessions;
    $('statLast').textContent = S.history.length ? stamp(S.history[0].at).slice(0, 11) : '—';
    $('dashboardHistory').innerHTML = S.history.length ? S.history.slice(0, 4).map(historyHTML).join('') : '<div class="empty">まだ認証履歴はありません。</div>';
  }
  function renderPeople() {
    $('peopleGrid').innerHTML = S.people.length ? S.people.map(function (p) {
      return '<article class="person-card"><div class="avatar">' + esc(p.name.charAt(0)) +
        '</div><div class="person-info"><b>' + esc(p.name) + '</b><small>' +
        esc(role(p.role)) + ' · サンプル ' + p.descriptors.length +
        '件</small><div class="actions"><button class="small-btn" data-delete-person="' + esc(p.id) + '">削除</button></div></div></article>';
    }).join('') : '<div class="panel empty">登録人物はまだいません。「＋ 顔を登録」から追加してください。</div>';
  }
  function renderAll() { renderPeople(); renderHistory(); renderDashboard(); }
  function view(n) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + n); });
    document.querySelectorAll('.nav-item').forEach(function (v) { v.classList.toggle('active', v.dataset.view === n); });
    if (n === 'people') renderPeople();
    if (n === 'history') renderHistory();
    if (n === 'dashboard') renderDashboard();
  }

  function loadModels() {
    if (S.modelsPromise) return S.modelsPromise;
    S.modelsPromise = new Promise(function (resolve, reject) {
      if (!window.faceapi) {
        reject(new Error('顔認識ライブラリを読み込めません。通信状態を確認して再読み込みしてください'));
        return;
      }
      $('modelStatus').textContent = '認識モデル読込中…';
      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL)
      ]).then(function () {
        $('modelStatus').textContent = '認識エンジン準備完了';
        resolve();
      }).catch(function (e) {
        S.modelsPromise = null;
        $('modelStatus').textContent = 'モデル読込エラー';
        reject(new Error('認識モデルを取得できません。通信を確認し、ページを再読み込みしてください (' + (e.message || 'network error') + ')'));
      });
    });
    return S.modelsPromise;
  }

  function stopVideo(video, stream) {
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    if (video) {
      try { video.pause(); } catch (_) {}
      video.srcObject = null;
    }
  }
  function waitForVideo(video) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () { finish(new Error('カメラ映像の準備に時間がかかっています。もう一度起動してください')); }, 10000);
      function finish(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', ready);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', failed);
        if (err) reject(err); else resolve();
      }
      function ready() {
        if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) finish();
      }
      function failed() { finish(new Error('カメラ映像を読み込めません')); }
      video.addEventListener('loadedmetadata', ready);
      video.addEventListener('loadeddata', ready);
      video.addEventListener('error', failed);
      ready();
    });
  }
  function camera(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('カメラにはHTTPS接続とSafariのカメラ許可が必要です'));
    }
    var preferred = { audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 960 }, height: { ideal: 540 } } };
    return navigator.mediaDevices.getUserMedia(preferred).catch(function () {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }).then(function (stream) {
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = stream;
      return waitForVideo(video).then(function () {
        return video.play();
      }).then(function () {
        if (!video.videoWidth || !video.videoHeight) throw new Error('カメラ映像サイズを取得できません');
        return stream;
      }).catch(function (e) {
        stopVideo(video, stream);
        throw e;
      });
    }).catch(function (e) {
      if (e && e.name === 'NotAllowedError') throw new Error('カメラが許可されていません。Safariのサイト設定でカメラを許可してください');
      if (e && e.name === 'NotFoundError') throw new Error('利用できるカメラが見つかりません');
      if (e && e.name === 'NotReadableError') throw new Error('カメラがほかのアプリで使用中の可能性があります。ほかのカメラアプリを閉じてください');
      throw e;
    });
  }

  function start() {
    if (S.running) return;
    $('startCamera').disabled = true;
    $('modelStatus').textContent = 'カメラ準備中…';
    loadModels().then(function () { return camera($('video')); }).then(function (s) {
      S.stream = s;
      S.running = true;
      S.sessions++;
      put('meta', { key: 'sessions', value: S.sessions }).catch(console.warn);
      $('video').classList.add('ready');
      $('cameraPlaceholder').classList.add('hidden');
      $('cameraDot').classList.add('on');
      $('cameraState').textContent = '稼働中';
      $('startCamera').disabled = true;
      $('stopCamera').disabled = false;
      $('modelStatus').textContent = '認識エンジン準備完了';
      renderDashboard();
      toast('カメラを起動しました');
      loop();
    }).catch(function (e) {
      $('startCamera').disabled = false;
      $('modelStatus').textContent = '待機中';
      toast(e.message || 'カメラを起動できませんでした');
      stop();
    });
  }
  function stop() {
    S.running = false;
    S.busy = false;
    stopVideo($('video'), S.stream);
    S.stream = null;
    $('video').classList.remove('ready');
    $('cameraPlaceholder').classList.remove('hidden');
    $('cameraDot').classList.remove('on');
    $('cameraState').textContent = '停止中';
    $('startCamera').disabled = false;
    $('stopCamera').disabled = true;
    var c = $('overlay').getContext('2d');
    c.clearRect(0, 0, $('overlay').width, $('overlay').height);
    live([]);
  }

  function distance(a, b) {
    var n = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; n += d * d; }
    return Math.sqrt(n);
  }
  function match(d) {
    var best = null, bd = Infinity;
    S.people.forEach(function (p) {
      p.descriptors.forEach(function (x) { var z = distance(d, x); if (z < bd) { bd = z; best = p; } });
    });
    if (!best) return null;
    var score = Math.max(0, Math.min(99, Math.round((1 - bd / 0.9) * 100)));
    return bd <= S.settings.threshold / 100 * 0.9 ? { person: best, score: score } : null;
  }
  function pose(l) {
    if (!S.settings.poseEnabled) return '';
    var p = l.positions, n = p[30], mid = (p[36].x + p[45].x) / 2;
    var span = Math.max(1, p[45].x - p[36].x), dx = (n.x - mid) / span, dy = (n.y - p[27].y) / span;
    return Math.abs(dx) > 0.16 ? (dx > 0 ? '左向き' : '右向き') : dy > 0.42 ? '下向き' : dy < 0.16 ? '上向き' : '正面';
  }
  function blink(l) {
    if (!S.settings.blinkEnabled) return false;
    var p = l.positions;
    var eye = Math.hypot(p[36].x - p[39].x, p[36].y - p[39].y);
    var v = (Math.hypot(p[37].x - p[41].x, p[37].y - p[41].y) + Math.hypot(p[38].x - p[40].x, p[38].y - p[40].y)) / (2 * Math.max(1, eye));
    if (v < 0.18) S.eyeClosed = true;
    else if (S.eyeClosed && v > 0.23) { S.lastBlink = Date.now(); S.eyeClosed = false; }
    return Date.now() - (S.lastBlink || 0) < 1600;
  }
  function record(person, kind, score) {
    var key = kind + ':' + (person.id || 'unknown');
    if (S.lastRecords[key] && Date.now() - S.lastRecords[key] < 8000) return;
    S.lastRecords[key] = Date.now();
    S.history.unshift({ id: String(Date.now()) + Math.random(), name: person.name, kind: kind, score: score, at: Date.now() });
    S.history = S.history.slice(0, 10);
    put('meta', { key: 'history', value: S.history }).catch(console.warn);
    renderHistory(); renderDashboard();
  }
  function live(items) {
    $('liveCount').textContent = items.length;
    $('faceCount').textContent = '検出 ' + items.length + ' 人';
    $('liveList').innerHTML = items.length ? items.map(function (x) {
      return '<div class="live-person"><div class="avatar">' + (x.kind === 'known' ? esc(x.name.charAt(0)) : '?') +
        '</div><div class="person-info"><b>' + esc(x.name) + '</b><small>' +
        (x.kind === 'known' ? esc(role(x.role)) : '未登録者') + (x.pose ? ' · ' + esc(x.pose) : '') +
        (x.blink ? ' · まばたき検出' : '') + '</small></div><span class="match ' +
        (x.kind === 'known' ? '' : 'unknown-text') + '">' + x.score + '%</span></div>';
    }).join('') : '<div class="empty">顔を検出していません。</div>';
  }
  function loop() {
    if (!S.running) return;
    var t = performance.now();
    if (!S.busy && $('video').readyState >= 2 && $('video').videoWidth > 0) {
      S.busy = true;
      faceapi.detectAllFaces($('video'), new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks().withFaceDescriptors().then(function (rs) {
          if (!S.running) return;
          var v = $('video'), c = $('overlay');
          if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
          var x = c.getContext('2d');
          x.clearRect(0, 0, c.width, c.height);
          var list = [];
          rs.forEach(function (r) {
            var m = match(r.descriptor), p = r.detection.box;
            x.strokeStyle = m ? '#25c28a' : '#e9a23b'; x.lineWidth = 3;
            x.strokeRect(p.x, p.y, p.width, p.height);
            x.fillStyle = x.strokeStyle; x.font = '16px sans-serif';
            x.fillText(m ? m.person.name : '未登録者', p.x, Math.max(18, p.y - 8));
            var item = m ?
              { kind: 'known', name: m.person.name, role: m.person.role, score: m.score, pose: pose(r.landmarks), blink: blink(r.landmarks) } :
              { kind: 'unknown', name: '未登録者', score: 0, pose: pose(r.landmarks), blink: blink(r.landmarks) };
            list.push(item);
            record(m ? m.person : { name: '未登録者' }, m ? 'known' : 'unknown', m ? m.score : 0);
          });
          live(list);
          $('fpsLabel').textContent = '解析 ' + Math.round(1000 / Math.max(1, performance.now() - t)) + ' FPS相当';
        }).catch(function (e) {
          console.warn('face detection failed', e);
          $('fpsLabel').textContent = '解析エラー（再試行中）';
        }).finally(function () { S.busy = false; });
    }
    if (S.running) S.loopTimer = setTimeout(loop, 500);
  }

  function startReg() {
    if (S.regStarting || S.regStream) return;
    S.regStarting = true;
    $('registerCameraBtn').disabled = true;
    $('registerCameraBtn').textContent = '準備中…';
    // iOS Safariでは同時に2つの映像ストリームを開くと不安定になるため、認識側を先に停止する。
    if (S.running) stop();
    loadModels().then(function () { return camera($('registerVideo')); }).then(function (s) {
      S.regStream = s;
      $('registerVideo').classList.add('ready');
      $('registerPlaceholder').classList.add('hidden');
      $('captureSample').disabled = false;
      $('registerCameraBtn').textContent = 'カメラ起動済み';
      toast('登録カメラの準備ができました');
    }).catch(function (e) {
      $('registerCameraBtn').textContent = '登録カメラを起動';
      toast(e.message || '登録カメラを起動できませんでした');
    }).finally(function () {
      S.regStarting = false;
      $('registerCameraBtn').disabled = !!S.regStream;
    });
  }
  function stopReg() {
    stopVideo($('registerVideo'), S.regStream);
    S.regStream = null;
    $('registerVideo').classList.remove('ready');
    $('registerPlaceholder').classList.remove('hidden');
    $('captureSample').disabled = true;
    $('registerCameraBtn').disabled = false;
    $('registerCameraBtn').textContent = '登録カメラを起動';
  }
  function capture() {
    var v = $('registerVideo');
    if (S.captureBusy) return;
    if (!S.regStream || v.readyState < 2 || !v.videoWidth || !v.videoHeight) {
      toast('カメラ映像の準備ができていません。登録カメラを起動し直してください');
      return;
    }
    S.captureBusy = true;
    $('captureSample').disabled = true;
    $('captureSample').textContent = '顔を確認中…';
    loadModels().then(function () {
      return faceapi.detectSingleFace(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
        .withFaceLandmarks().withFaceDescriptor();
    }).then(function (r) {
      if (!r) throw new Error('顔を検出できません。明るい場所で正面を向き、顔全体を画面に入れてください');
      var img = null;
      if (S.settings.saveImages) {
        var c = document.createElement('canvas');
        c.width = 320; c.height = 240;
        var ctx = c.getContext('2d');
        ctx.drawImage(v, 0, 0, c.width, c.height);
        img = c.toDataURL('image/jpeg', 0.65);
      }
      S.samples.push({ descriptor: Array.from(r.descriptor), image: img });
      $('sampleCount').textContent = S.samples.length + ' / 3';
      $('samplePreview').innerHTML = S.samples.map(function (s) {
        return s.image ? '<img class="sample-thumb" src="' + s.image + '" alt="登録サンプル">' : '<div class="sample-thumb"></div>';
      }).join('');
      $('savePerson').disabled = S.samples.length < 3;
      toast('サンプル ' + S.samples.length + ' 枚目を撮影しました');
    }).catch(function (e) {
      toast(e.message || '顔サンプルを取得できませんでした');
    }).finally(function () {
      S.captureBusy = false;
      $('captureSample').disabled = !S.regStream;
      $('captureSample').textContent = '顔サンプルを撮影';
    });
  }
  function savePerson() {
    var name = $('personName').value.trim();
    if (!name) { toast('表示名を入力してください'); return; }
    if (S.samples.length < 3) { toast('3枚以上のサンプルが必要です'); return; }
    $('savePerson').disabled = true;
    var p = {
      id: String(Date.now()) + Math.random(), name: name, role: $('personRole').value,
      descriptors: S.samples.map(function (s) { return s.descriptor; }),
      images: S.samples.map(function (s) { return s.image; }).filter(Boolean),
      createdAt: Date.now()
    };
    put('people', p).then(function () { return getAll('people'); }).then(function (a) {
      S.people = a; S.samples = [];
      $('samplePreview').innerHTML = '';
      $('sampleCount').textContent = '0 / 3';
      $('personName').value = '';
      stopReg();
      $('registerPanel').classList.add('hidden');
      renderAll();
      toast('人物を端末内に保存しました');
    }).catch(function (e) {
      $('savePerson').disabled = false;
      toast('保存に失敗しました。端末の空き容量やSafariの設定を確認してください');
      console.error(e);
    });
  }
  function saveSettings() {
    S.settings = {
      threshold: Number($('threshold').value), poseEnabled: $('poseEnabled').checked,
      blinkEnabled: $('blinkEnabled').checked, saveImages: $('saveImages').checked
    };
    $('thresholdValue').textContent = S.settings.threshold + '%';
    put('meta', { key: 'settings', value: S.settings }).catch(function () { toast('設定を保存できませんでした'); });
  }
  function erase() {
    if (!confirm('この端末の登録人物・顔サンプル・履歴をすべて削除します。元に戻せません。よろしいですか？')) return;
    Promise.all([clear('people'), clear('meta')]).then(function () {
      S.people = []; S.history = []; S.sessions = 0; S.samples = [];
      renderAll(); toast('端末内データを削除しました');
    }).catch(function () { toast('削除に失敗しました'); });
  }

  document.addEventListener('click', function (e) {
    var n = e.target.closest('[data-view]'), g = e.target.closest('[data-goto]'), d = e.target.closest('[data-delete-person]');
    if (n) view(n.dataset.view);
    if (g) view(g.dataset.goto);
    if (d && confirm('この人物の顔データを削除しますか？')) {
      del('people', d.dataset.deletePerson).then(function () { return getAll('people'); })
        .then(function (a) { S.people = a; renderAll(); toast('人物を削除しました'); })
        .catch(function () { toast('削除に失敗しました'); });
    }
  });
  $('startCamera').onclick = start;
  $('stopCamera').onclick = stop;
  $('openRegister').onclick = function () {
    S.samples = [];
    $('samplePreview').innerHTML = '';
    $('sampleCount').textContent = '0 / 3';
    $('savePerson').disabled = true;
    $('registerPanel').classList.remove('hidden');
  };
  $('closeRegister').onclick = function () {
    $('registerPanel').classList.add('hidden');
    stopReg();
  };
  $('registerCameraBtn').onclick = startReg;
  $('captureSample').onclick = capture;
  $('savePerson').onclick = savePerson;
  $('clearHistory').onclick = function () {
    if (confirm('認証履歴を削除しますか？')) {
      S.history = [];
      put('meta', { key: 'history', value: [] }).then(function () { renderHistory(); renderDashboard(); })
        .catch(function () { toast('履歴を削除できませんでした'); });
    }
  };
  $('eraseAll').onclick = erase;
  ['threshold', 'poseEnabled', 'blinkEnabled', 'saveImages'].forEach(function (id) { $(id).addEventListener('change', saveSettings); });
  $('threshold').addEventListener('input', function () { $('thresholdValue').textContent = this.value + '%'; });
  window.addEventListener('pagehide', function () { stop(); stopReg(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); stopReg(); }
  });
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
  openDB().then(initData).catch(function (e) {
    $('modelStatus').textContent = '保存領域エラー';
    toast(e.message || 'ローカルデータベースを開けませんでした');
  });
})();