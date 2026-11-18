"use strict";

const $ = id => document.getElementById(id);
const STORAGE_KEY = "rc_paired_devices_v1";
const SELECTED_KEY = "rc_selected_device_v1";
const S = {
  cfg: null,
  devices: [],
  device: null,
  pc: null,
  mic: null,
  remoteAudioTracks: [],
  pttActive: false,
  session: "",
  seq: 0,
  map: null,
  marker: null,
  route: null,
  history: [],
  lastLocation: null,
  followMap: true,
  zoom: 1,
  fitMode: "contain",
  reconnectTimer: null,
  reconnectAttempts: 0,
  manualDisconnect: false,
  statsTimer: null,
  statsBusy: false,
  previousStats: null,
  sessionTimer: null,
  connectedAt: 0
};

function rid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now().toString(36) + Math.random().toString(36).slice(2));
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("show"), 3200);
}
function status(text, online = false) {
  $("status").textContent = text;
  $("status").className = "pill" + (online ? " online" : "");
}
function message(id, text, good = false) {
  $(id).textContent = text;
  $(id).style.color = good ? "#16714d" : "#b43e48";
}
function readDevices() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(x =>
      x && typeof x.deviceId === "string" &&
      typeof x.controllerToken === "string" && x.controllerToken.length > 20
    ) : [];
  } catch (_) {
    return [];
  }
}
function saveDevices() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S.devices));
}
async function loadConfig() {
  const response = await fetch("./config.json", { cache: "no-store" });
  if (!response.ok) throw Error("config.jsonを読み込めません。");
  S.cfg = await response.json();
  if (!S.cfg.gasUrl || !S.cfg.gasUrl.endsWith("/exec") ||
      S.cfg.gasUrl.includes("PASTE_YOUR_DEPLOYMENT_ID")) {
    throw Error("web/config.json の gasUrl にGASの /exec URLを設定してください。");
  }
}

/**
 * GAS HTML response is returned through a hidden iframe.
 * Match both the request ID and the exact iframe window before accepting it.
 */
function api(action, data = {}) {
  return new Promise((resolve, reject) => {
    const id = rid();
    const frame = document.createElement("iframe");
    const form = document.createElement("form");
    frame.name = "gas_" + id;
    frame.title = "GAS response";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    // Keep the iframe renderable: iOS Safari can be unreliable with hidden form targets.
    frame.style.cssText = "position:fixed;width:1px;height:1px;left:-2px;top:-2px;opacity:0;pointer-events:none;border:0";
    form.hidden = true;
    form.method = "POST";
    form.action = S.cfg.gasUrl;
    form.target = frame.name;

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify({ action, requestId: id, ...data });
    form.appendChild(input);
    document.body.append(frame, form);

    let finished = false;
    const timer = setTimeout(() => finish(
      Error("GASから30秒以内に応答が届きませんでした。GASの再デプロイ状態と通信設定を確認してください。")
    ), Number(S.cfg.requestTimeoutMs) || 30000);

    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("message", listener);
      frame.remove();
      form.remove();
      if (error) reject(error);
      else resolve(value);
    }
    function listener(event) {
      // Apps Script HtmlService may nest its sandbox iframe. In that case the
      // message source is the nested Google frame, not frame.contentWindow.
      // The random requestId and trusted Google origin below bind the response.
      if (!event.data || event.data.channel !== "remote-camera-gas" ||
          event.data.requestId !== id) return;
      const origin = String(event.origin || "");
      const allowedOrigin = origin === "https://script.google.com" ||
        origin === "https://script.googleusercontent.com" ||
        origin.endsWith(".googleusercontent.com");
      if (!allowedOrigin) return;
      const result = event.data.result;
      if (!result || result.ok !== true) {
        finish(Error(result && result.error ? result.error : "GAS APIエラー"));
      } else {
        finish(null, result);
      }
    }
    window.addEventListener("message", listener);
    try {
      form.submit();
    } catch (error) {
      finish(error);
    }
  });
}

function renderDevices() {
  const box = $("devices");
  box.replaceChildren();
  if (!S.devices.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "登録済み端末はありません。Androidで監視待機を開始し、ペアリングしてください。";
    box.appendChild(p);
    return;
  }
  S.devices.forEach(device => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deviceitem" + (S.device && S.device.deviceId === device.deviceId ? " selected" : "");
    const strong = document.createElement("b");
    const small = document.createElement("small");
    strong.textContent = device.deviceName || "Android端末";
    small.textContent = "端末ID: " + device.deviceId.slice(0, 12);
    button.append(strong, small);
    button.addEventListener("click", () => selectDevice(device));
    box.appendChild(button);
  });
}
function setControlsEnabled(enabled) {
  ["connect", "locate", "saveSettings", "history", "deleteHistory", "unpair"].forEach(id => {
    $(id).disabled = !enabled;
  });
  $("connect").disabled = !enabled || !!S.pc;
  $("disconnect").disabled = !S.pc;
  $("camera").disabled = !enabled || !S.pc;
  $("ptt").disabled = !S.pc;
}
function selectDevice(device) {
  S.device = device;
  localStorage.setItem(SELECTED_KEY, device.deviceId);
  $("deviceName").textContent = device.deviceName || "Android端末";
  $("deviceMeta").textContent = "端末ID: " + device.deviceId + " / このiPadにペアリング済み";
  renderDevices();
  setControlsEnabled(true);
  status("ペアリング済み");
  loadSettings().catch(error => toast(error.message));
}
function refreshDeviceList() {
  S.devices = readDevices();
  renderDevices();
  if (S.device) {
    const updated = S.devices.find(x => x.deviceId === S.device.deviceId);
    if (updated) S.device = updated;
  }
  if (!S.device && S.devices.length) {
    const id = localStorage.getItem(SELECTED_KEY);
    selectDevice(S.devices.find(x => x.deviceId === id) || S.devices[0]);
  } else if (!S.devices.length) {
    S.device = null;
    $("deviceName").textContent = "Android端末をペアリングしてください";
    $("deviceMeta").textContent = "待機中";
    setControlsEnabled(false);
    status("未ペアリング");
  }
}
async function claimDevice() {
  const code = $("pairCode").value.trim();
  const deviceName = $("pairName").value.trim();
  if (!/^\d{8}$/.test(code)) {
    message("pairMessage", "8桁の登録コードを入力してください。");
    return;
  }
  $("claim").disabled = true;
  message("pairMessage", "Android端末を確認しています…", true);
  try {
    const result = await api("claim_device", { code, deviceName });
    const device = {
      deviceId: result.deviceId,
      deviceName: result.deviceName || deviceName || "Android端末",
      controllerToken: result.controllerToken
    };
    S.devices = readDevices().filter(x => x.deviceId !== device.deviceId);
    S.devices.push(device);
    saveDevices();
    $("pairCode").value = "";
    $("pairName").value = "";
    $("pairDialog").close();
    refreshDeviceList();
    selectDevice(device);
    toast("Androidをペアリングしました。");
  } catch (error) {
    message("pairMessage", error.message);
  } finally {
    $("claim").disabled = false;
  }
}

function waitIce(pc, ms) {
  return new Promise(resolve => {
    if (pc.iceGatheringState === "complete") return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const timer = setTimeout(finish, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}
async function formatDuration(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

function startSessionClock() {
  if (S.sessionTimer) return;
  S.connectedAt = Date.now();
  const update = () => {
    $("sessionDuration").textContent = "接続時間 " + formatDuration(Date.now() - S.connectedAt);
  };
  update();
  S.sessionTimer = setInterval(update, 1000);
}

function stopSessionClock() {
  if (S.sessionTimer) clearInterval(S.sessionTimer);
  S.sessionTimer = null;
  S.connectedAt = 0;
  if ($("sessionDuration")) $("sessionDuration").textContent = "接続時間 00:00:00";
}

function stopStatsMonitor() {
  if (S.statsTimer) clearInterval(S.statsTimer);
  S.statsTimer = null;
  S.previousStats = null;
  S.statsBusy = false;
  if ($("connectionMetrics")) $("connectionMetrics").textContent = "通信状態：未接続";
}

async function collectConnectionStats(pc) {
  if (!pc || pc !== S.pc || S.statsBusy || typeof pc.getStats !== "function") return;
  S.statsBusy = true;
  try {
    const report = await pc.getStats();
    if (pc !== S.pc) return;
    let video = null;
    let candidatePair = null;
    report.forEach(stat => {
      if (stat.type === "inbound-rtp" &&
          (stat.kind === "video" || stat.mediaType === "video") &&
          !stat.isRemote) video = stat;
      if (stat.type === "candidate-pair" &&
          stat.state === "succeeded" && (stat.selected || stat.nominated)) candidatePair = stat;
    });
    if (!video) return;
    const current = {
      timestamp: Number(video.timestamp) || Date.now(),
      bytes: Number(video.bytesReceived) || 0,
      packetsReceived: Number(video.packetsReceived) || 0,
      packetsLost: Number(video.packetsLost) || 0,
      frames: Number(video.framesDecoded) || 0
    };
    const previous = S.previousStats;
    S.previousStats = current;
    const rttMs = candidatePair && Number.isFinite(Number(candidatePair.currentRoundTripTime))
      ? Math.round(Number(candidatePair.currentRoundTripTime) * 1000) : null;
    if (!previous) {
      $("connectionMetrics").textContent = "通信状態：測定中";
      return;
    }
    const elapsed = Math.max(0.2, (current.timestamp - previous.timestamp) / 1000);
    const bitrate = Math.max(0, (current.bytes - previous.bytes) * 8 / elapsed / 1000);
    const fps = Math.max(0, (current.frames - previous.frames) / elapsed);
    const receivedDelta = Math.max(0, current.packetsReceived - previous.packetsReceived);
    const lostDelta = Math.max(0, current.packetsLost - previous.packetsLost);
    const loss = receivedDelta + lostDelta > 0 ? lostDelta / (receivedDelta + lostDelta) * 100 : 0;
    const grade = loss > 8 || (rttMs !== null && rttMs > 500) || fps < 8
      ? "不安定" : loss > 3 || (rttMs !== null && rttMs > 280) || fps < 17 ? "注意" : "良好";
    $("connectionMetrics").textContent =
      "通信 " + grade + "　受信 " + bitrate.toFixed(0) + " kbps　" +
      "映像 " + fps.toFixed(0) + " fps　" +
      "遅延 " + (rttMs === null ? "--" : rttMs + " ms") + "　" +
      "損失 " + loss.toFixed(1) + "%";
  } catch (error) {
    console.debug("getStats unavailable", error);
  } finally {
    S.statsBusy = false;
  }
}

function startStatsMonitor(pc) {
  stopStatsMonitor();
  collectConnectionStats(pc);
  S.statsTimer = setInterval(() => collectConnectionStats(pc), 2500);
}

function scheduleReconnect(failedPeer) {
  if (S.manualDisconnect || !S.device || S.reconnectTimer) return;
  const waits = [2500, 5000, 10000, 15000, 20000];
  if (S.reconnectAttempts >= waits.length) {
    toast("自動再接続を終了しました。回線とAndroidの待機状態を確認してください。");
    return;
  }
  const attempt = S.reconnectAttempts + 1;
  const wait = waits[S.reconnectAttempts];
  status("再接続を準備中", false);
  $("streamState").textContent = "再接続 " + attempt + "/" + waits.length;
  S.reconnectTimer = setTimeout(async () => {
    S.reconnectTimer = null;
    if (S.manualDisconnect || !S.device || (failedPeer && S.pc !== failedPeer)) return;
    if (failedPeer && ["connected", "connecting"].includes(failedPeer.connectionState)) return;
    S.reconnectAttempts = attempt;
    await disconnect(false);
    await connect(true);
  }, wait);
}

function updateViewerTransform() {
  const video = $("remoteVideo");
  video.style.transform = "scale(" + S.zoom + ")";
  video.style.objectFit = S.fitMode;
  $("zoomValue").textContent = Math.round(S.zoom * 100) + "%";
}

async function toggleFullscreen() {
  const pane = $("videoPane");
  const video = $("remoteVideo");
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (pane.requestFullscreen) {
      await pane.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    } else {
      toast("このブラウザーは全画面表示に対応していません。");
    }
  } catch (error) {
    toast("全画面表示に失敗しました: " + error.message);
  }
}

async function copyCoordinates() {
  if (!S.lastLocation) return toast("コピーできる位置情報がありません。");
  const text = Number(S.lastLocation.lat).toFixed(6) + ", " +
    Number(S.lastLocation.lng).toFixed(6);
  try {
    await navigator.clipboard.writeText(text);
    toast("座標をコピーしました: " + text);
  } catch (_) {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    toast(copied ? "座標をコピーしました: " + text : "座標をコピーできませんでした。");
  }
}

async function connect(automatic = false) {
  // A direct click handler receives a PointerEvent; only the literal true
  // value is used for an automatic retry.
  automatic = automatic === true;
  if (!S.device) return toast("先にAndroidをペアリングしてください。");
  if (!automatic) {
    S.manualDisconnect = false;
    S.reconnectAttempts = 0;
  }
  if (S.reconnectTimer) {
    clearTimeout(S.reconnectTimer);
    S.reconnectTimer = null;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return toast("このブラウザではマイクを利用できません。SafariのHTTPS接続を確認してください。");
  }
  if (S.pc) await disconnect(false);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    S.mic = stream;
    stream.getAudioTracks().forEach(track => { track.enabled = false; });
    S.session = rid();
    S.seq = 0;
    // STUN can improve NAT traversal. A TURN relay is still needed on networks
    // that block direct peer-to-peer UDP traffic.
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });
    S.pc = pc;
    $("camera").disabled = false;
    const remote = new MediaStream();
    $("remoteVideo").srcObject = remote;
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTrack(stream.getAudioTracks()[0]);
    pc.ontrack = event => {
      const tracks = event.streams[0] ? event.streams[0].getTracks() : [event.track];
      tracks.forEach(track => {
        if (!remote.getTracks().some(existing => existing.id === track.id)) remote.addTrack(track);
        if (track.kind === "audio" && !S.remoteAudioTracks.some(existing => existing.id === track.id)) {
          track.enabled = !S.pttActive;
          S.remoteAudioTracks.push(track);
        }
      });
      $("placeholder").classList.add("hidden");
      $("remoteVideo").play().catch(() => toast("映像・音声を再生するには画面をタップしてください。"));
    };
    pc.onconnectionstatechange = () => {
      if (S.pc !== pc) return;
      const state = pc.connectionState;
      $("iceState").textContent = "ICE: " + state;
      status(state === "connected" ? "監視中" : state, state === "connected");
      $("streamState").textContent = state === "connected" ? "映像・音声接続中" : "接続処理中";
      if (state === "connected") {
        S.reconnectAttempts = 0;
        if (S.reconnectTimer) clearTimeout(S.reconnectTimer);
        S.reconnectTimer = null;
        startSessionClock();
        startStatsMonitor(pc);
      } else if (state === "failed" || state === "disconnected") {
        if (S.connectedAt) stopSessionClock();
        scheduleReconnect(pc);
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc, 20000);
    await api("send_signal", {
      controllerToken: S.device.controllerToken,
      deviceId: S.device.deviceId,
      sessionId: S.session,
      recipient: "device",
      kind: "offer",
      sdp: pc.localDescription.sdp
    });
    $("connect").disabled = true;
    $("disconnect").disabled = false;
    $("ptt").disabled = false;
    $("streamState").textContent = "Android応答待ち";
    status("接続要求中");
    pollAnswers();
  } catch (error) {
    await disconnect(false);
    toast("接続開始失敗: " + error.message);
    if (error.name !== "NotAllowedError" && error.name !== "PermissionDeniedError") {
      scheduleReconnect(null);
    } else {
      S.manualDisconnect = true;
    }
  }
}
async function pollAnswers() {
  while (S.pc && S.session && S.device) {
    try {
      const result = await api("poll_signals", {
        controllerToken: S.device.controllerToken,
        deviceId: S.device.deviceId,
        sessionId: S.session,
        afterSeq: S.seq
      });
      for (const signal of result.signals || []) {
        S.seq = Math.max(S.seq, Number(signal.seq) || 0);
        if (signal.kind === "answer" && !S.pc.remoteDescription) {
          await S.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        } else if (signal.kind === "error") {
          toast(signal.sdp || "Android側で接続エラーが発生しました。");
        }
      }
    } catch (error) {
      console.warn("pollAnswers", error);
    }
    await new Promise(resolve => setTimeout(resolve, Number(S.cfg.pollIntervalMs) || 2500));
  }
}
async function disconnect(sendCommand = true) {
  if (sendCommand) {
    S.manualDisconnect = true;
    if (S.reconnectTimer) clearTimeout(S.reconnectTimer);
    S.reconnectTimer = null;
  }
  stopStatsMonitor();
  stopSessionClock();
  if (sendCommand && S.pc && S.device) {
    const signal = {
      controllerToken: S.device.controllerToken,
      deviceId: S.device.deviceId,
      sessionId: S.session,
      recipient: "device",
      kind: "bye"
    };
    api("send_signal", signal).catch(() => {});
    api("send_command", {
      controllerToken: S.device.controllerToken,
      deviceId: S.device.deviceId,
      command: "disconnect",
      payload: {}
    }).catch(() => {});
  }
  const old = S.pc;
  S.pc = null;
  S.session = "";
  try { if (old) old.close(); } catch (_) {}
  if (S.mic) S.mic.getTracks().forEach(track => track.stop());
  S.mic = null;
  S.pttActive = false;
  S.remoteAudioTracks = [];
  $("remoteVideo").srcObject = null;
  $("placeholder").classList.remove("hidden");
  $("connect").disabled = !S.device;
  $("disconnect").disabled = true;
  $("camera").disabled = true;
  $("ptt").disabled = true;
  $("ptt").classList.remove("active");
  $("ptt").textContent = "押している間だけ話す";
  $("streamState").textContent = "切断済み";
  $("iceState").textContent = "ICE: --";
  if (S.reconnectAttempts >= 5 && !sendCommand) {
    $("streamState").textContent = "再接続上限到達";
  }
  if (S.device) status("ペアリング済み");
  else status("未ペアリング");
}
function ptt(enabled) {
  const track = S.mic && S.mic.getAudioTracks()[0];
  if (!track) return;
  S.pttActive = enabled;
  track.enabled = enabled;
  // Half-duplex: mute the Android return audio while sending PTT audio.
  S.remoteAudioTracks.forEach(remoteTrack => { remoteTrack.enabled = !enabled; });
  $("ptt").classList.toggle("active", enabled);
  $("ptt").textContent = enabled ? "送話中…" : "押している間だけ話す";
}
async function loadSettings() {
  if (!S.device) return;
  const result = await api("get_settings", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId
  });
  const settings = result.settings || {};
  $("quality").value = settings.quality || "720";
  $("dataMode").value = settings.dataMode || "standard";
  $("connectedLoc").checked = !!settings.connectedLocationEnabled;
  $("idleLoc").checked = !!settings.idleLocationEnabled;
  $("connectedInterval").value = String(settings.connectedInterval || 30);
  $("idleInterval").value = String(settings.idleInterval || 300);
}
async function saveSettings() {
  if (!S.device) return toast("Android端末をペアリングしてください。");
  const settings = {
    quality: $("quality").value,
    dataMode: $("dataMode").value,
    connectedLocationEnabled: $("connectedLoc").checked,
    idleLocationEnabled: $("idleLoc").checked,
    connectedInterval: Number($("connectedInterval").value),
    idleInterval: Number($("idleInterval").value)
  };
  await api("save_settings", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId,
    settings
  });
  await api("send_command", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId,
    command: "quality",
    payload: { quality: settings.quality, dataMode: settings.dataMode }
  });
  toast("設定を保存しました。");
}
async function command(name, payload = {}) {
  if (!S.device) return toast("Android端末をペアリングしてください。");
  await api("send_command", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId,
    command: name,
    payload
  });
  toast("Androidへ命令しました。");
}

async function unpairSelectedDevice() {
  if (!S.device) return;
  if (!confirm("このAndroid端末とiPadのペアリングを解除します。Android側の監視映像・音声も次回通信時に停止します。よろしいですか？")) return;
  const selected = S.device;
  $("unpair").disabled = true;
  try {
    await api("unpair_device", {
      controllerToken: selected.controllerToken,
      deviceId: selected.deviceId
    });
    await disconnect(false);
    S.devices = S.devices.filter(device => device.deviceId !== selected.deviceId);
    saveDevices();
    localStorage.removeItem(SELECTED_KEY);
    S.device = null;
    refreshDeviceList();
    status("ペアリング解除済み");
    toast("ペアリングを解除しました。");
  } catch (error) {
    toast("ペアリング解除失敗: " + error.message);
    $("unpair").disabled = false;
  }
}

async function loadHistory() {
  if (!S.device) return toast("Android端末をペアリングしてください。");
  const result = await api("get_locations", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId,
    limit: 500
  });
  S.history = result.locations || [];
  $("historyRows").replaceChildren();
  for (const point of [...S.history].reverse()) {
    const row = document.createElement("div");
    const span = document.createElement("span");
    const button = document.createElement("button");
    row.className = "historyrow";
    span.textContent = new Date(point.timestamp).toLocaleString() + " · " +
      Number(point.lat).toFixed(5) + ", " + Number(point.lng).toFixed(5);
    button.textContent = "地図";
    button.type = "button";
    button.addEventListener("click", () => {
      showMap();
      drawMap([point]);
      $("historyDialog").close();
    });
    row.append(span, button);
    $("historyRows").append(row);
  }
  showMap();
  drawMap(S.history);
  $("historyDialog").showModal();
}
function initMap() {
  if (S.map || !window.L) return;
  S.map = L.map("map").setView([35.6812, 139.7671], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(S.map);
}
function showMap() {
  $("videoPane").classList.add("hidden");
  $("mapPane").classList.remove("hidden");
  $("mapTab").classList.add("active");
  $("videoTab").classList.remove("active");
  initMap();
  setTimeout(() => { if (S.map) S.map.invalidateSize(); }, 100);
}
function showVideo() {
  $("mapPane").classList.add("hidden");
  $("videoPane").classList.remove("hidden");
  $("videoTab").classList.add("active");
  $("mapTab").classList.remove("active");
}
function drawMap(points) {
  initMap();
  if (!S.map) return;
  if (S.marker) S.marker.remove();
  if (S.route) S.route.remove();
  const valid = points.filter(point =>
    Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))
  );
  if (!valid.length) {
    S.lastLocation = null;
    $("locationInfo").textContent = "位置情報はありません。";
    return;
  }
  const last = valid[valid.length - 1];
  S.lastLocation = last;
  S.marker = L.marker([last.lat, last.lng]).addTo(S.map);
  if (valid.length > 1) {
    S.route = L.polyline(valid.map(point => [point.lat, point.lng]), { color: "#2865d6" }).addTo(S.map);
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(last.timestamp).getTime()) / 1000));
  $("locationInfo").textContent = "最終取得: " + new Date(last.timestamp).toLocaleString() +
    " / 精度 ±" + (last.accuracy || "?") + "m / " + ageSeconds + "秒前 / " + (last.mode || "取得");
  if (S.followMap) {
    if (S.route) S.map.fitBounds(S.route.getBounds().pad(0.15));
    else S.map.setView([last.lat, last.lng], 15);
  }
}
async function deleteHistory() {
  if (!S.device || !confirm("この端末の位置情報履歴をすべて削除します。よろしいですか？")) return;
  const result = await api("delete_locations", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId,
    all: true
  });
  S.history = [];
  drawMap([]);
  toast("履歴を " + (result.deleted || 0) + " 件削除しました。");
}

document.addEventListener("DOMContentLoaded", async () => {
  $("refresh").addEventListener("click", refreshDeviceList);
  $("pair").addEventListener("click", () => $("pairDialog").showModal());
  $("unpair").addEventListener("click", () => unpairSelectedDevice());
  $("claim").addEventListener("click", claimDevice);
  $("connect").addEventListener("click", connect);
  $("disconnect").addEventListener("click", () => disconnect(true));
  $("ptt").addEventListener("pointerdown", event => { event.preventDefault(); ptt(true); });
  ["pointerup", "pointerleave", "pointercancel", "lostpointercapture"].forEach(name => {
    $("ptt").addEventListener(name, () => ptt(false));
  });
  $("saveSettings").addEventListener("click", () => saveSettings().catch(error => toast(error.message)));
  $("locate").addEventListener("click", () => command("location_once").catch(error => toast(error.message)));
  $("history").addEventListener("click", () => loadHistory().catch(error => toast(error.message)));
  $("deleteHistory").addEventListener("click", () => deleteHistory().catch(error => toast(error.message)));
  $("videoTab").addEventListener("click", showVideo);
  $("mapTab").addEventListener("click", showMap);
  $("fullscreen").addEventListener("click", toggleFullscreen);
  $("viewerZoom").addEventListener("input", event => {
    S.zoom = Math.max(1, Math.min(2.5, Number(event.target.value) / 100));
    updateViewerTransform();
  });
  $("fitMode").addEventListener("click", () => {
    S.fitMode = S.fitMode === "contain" ? "cover" : "contain";
    $("fitMode").textContent = S.fitMode === "contain" ? "全体表示" : "画面に合わせる";
    updateViewerTransform();
  });
  $("mapFollow").addEventListener("change", event => {
    S.followMap = event.target.checked;
    if (S.followMap && S.lastLocation && S.map) {
      S.map.setView([S.lastLocation.lat, S.lastLocation.lng], 15);
    }
  });
  $("copyLocation").addEventListener("click", copyCoordinates);
  $("volume").addEventListener("input", event => { $("volumeValue").value = event.target.value + "%"; });
  $("volume").addEventListener("change", event => {
    command("volume", { percent: Number(event.target.value) }).catch(error => toast(error.message));
  });
  $("camera").addEventListener("change", event => {
    command("camera", { facing: event.target.value }).catch(error => toast(error.message));
  });
  $("quality").addEventListener("change", () => saveSettings().catch(error => toast(error.message)));
  $("dataMode").addEventListener("change", () => saveSettings().catch(error => toast(error.message)));
  updateViewerTransform();
  try {
    await loadConfig();
    S.devices = readDevices();
    renderDevices();
    try {
      const health = await api("health");
      if (!health.databaseReady) {
        $("pair").disabled = true;
        setControlsEnabled(false);
        status("GAS接続済み・DB未設定");
        toast(health.message || "GASのsetupDatabase()を実行し、最新バージョンをデプロイしてください。");
      } else {
        $("pair").disabled = false;
        refreshDeviceList();
        status(S.device ? "ペアリング済み" : "GAS接続済み・端末未登録", true);
      }
    } catch (healthError) {
      $("pair").disabled = true;
      setControlsEnabled(false);
      status("GAS応答なし");
      toast("GASへのPOST応答を確認できません: " + (healthError && healthError.message ? healthError.message : "不明な通信エラー") + "。Code.gsの更新・再デプロイも確認してください。");
      console.error("GAS health check failed", healthError);
    }
  } catch (error) {
    $("pair").disabled = true;
    setControlsEnabled(false);
    toast(error.message);
    status("設定エラー");
  }
});
