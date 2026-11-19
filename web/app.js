"use strict";

const $ = id => document.getElementById(id);
const STORAGE_KEY = "rc_paired_devices_v42";
const SELECTED_KEY = "rc_selected_device_v42";
const S = {
  cfg: null,
  devices: [],
  device: null,
  pc: null,
  mic: null,
  remoteAudioTracks: [],
  pttActive: false,
  pttLocked: false,
  remoteAudioMuted: false,
  remoteAnalyser: null,
  audioMeterFrame: null,
  pttSafetyTimer: null,
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
  reconnectResetTimer: null,
  reconnectAttempts: 0,
  manualDisconnect: false,
  statsTimer: null,
  statsBusy: false,
  previousStats: null,
  statsFreezeCount: 0,
  hasReceivedVideoFrame: false,
  videoWatchdogTimer: null,
  videoFrameCallbackId: null,
  videoUsesFrameCallback: false,
  lastVideoFrameAt: 0,
  audioContext: null,
  remoteGain: null,
  remoteAudioSource: null,
  remoteVideoStream: null,
  receiveVolume: 70,
  androidSpeakerVolume: 70,
  captureRatio: "16:9",
  fpsLimit: 24,
  appliedAdaptiveMode: "standard",
  adaptiveLastChangeAt: 0,
  adaptiveStableSince: 0,
  flashlightOn: false,
  wakeLock: null,
  keepAwakeWanted: false,
  androidStatusTimer: null,
  settingsSaveChain: Promise.resolve(),
  controlChannel: null,
  lastGasServerMs: null,
  lastGasApiVersion: "",
  sessionTimer: null,
  connectedAt: 0,
  motionTimer: null,
  motionPrevious: null,
  motionLastTriggered: 0,
  motionEvents: [],
  viewerHeartbeatTimer: null
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
function apiOnce(action, data = {}) {
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
    input.value = JSON.stringify({ action, requestId: id, clientOrigin: location.origin, ...data });
    form.appendChild(input);
    document.body.append(frame, form);

    let finished = false;
    const timer = setTimeout(() => {
      const error = Error("GAS応答がタイムアウトしました。安全な読み取り操作を自動再試行します。");
      error.transient = true;
      finish(error);
    }, Number(S.cfg.requestTimeoutMs) || 12000);

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
      if (result && Number.isFinite(Number(result.serverMs))) {
        S.lastGasServerMs = Number(result.serverMs);
        S.lastGasApiVersion = String(result.apiVersion || "");
        if ($("gasTiming")) {
          $("gasTiming").textContent = "GAS処理 " + S.lastGasServerMs + " ms" +
            (S.lastGasApiVersion ? " / API " + S.lastGasApiVersion : "");
        }
      }
      if (!result || result.ok !== true) {
        const error = Error(result && result.error ? result.error : "GAS APIエラー");
        error.serverMs = result && Number.isFinite(Number(result.serverMs)) ? Number(result.serverMs) : null;
        error.apiVersion = result && result.apiVersion ? String(result.apiVersion) : "";
        finish(error);
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

async function api(action, data = {}) {
  const safeRead = ["health", "poll_signals", "get_settings", "get_locations"].includes(action);
  const maxAttempts = safeRead ? 2 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await apiOnce(action, data);
    } catch (error) {
      if (!error.transient || attempt + 1 >= maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw Error("GAS通信に失敗しました。");
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
    small.textContent = "端末ID: " + device.deviceId.slice(0, 12) + (device.controllerName ? " · " + device.controllerName : "");
    button.append(strong, small);
    button.addEventListener("click", () => selectDevice(device));
    box.appendChild(button);
  });
}
function setControlsEnabled(enabled) {
  ["connect", "locate", "saveSettings", "history", "deleteHistory", "unpair", "viewers"].forEach(id => {
    $(id).disabled = !enabled;
  });
  $("connect").disabled = !enabled || !!S.pc;
  $("disconnect").disabled = !S.pc;
  $("camera").disabled = !enabled || !S.pc;
  $("ptt").disabled = !S.pc;
  $("pttLock").disabled = !S.pc;
  $("remoteMute").disabled = !S.pc;
  $("androidSpeakerVolume").disabled = !S.pc;
  $("snapshot").disabled = !S.pc;
  $("refreshStatus").disabled = !S.pc;
  if (!S.pc) updateFlashlightButton(false, false);
}
function selectDevice(device) {
  if (S.pc && S.device && S.device.deviceId !== device.deviceId) {
    toast("接続中の端末があります。先に切断してから端末を切り替えてください。");
    return;
  }
  S.device = device;
  localStorage.setItem(SELECTED_KEY, device.deviceId);
  $("deviceName").textContent = device.deviceName || "Android端末";
  $("deviceMeta").textContent = "端末ID: " + device.deviceId + " / 閲覧名: " + (device.controllerName || "このブラウザー");
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
  const controllerName = $("pairName").value.trim() || "Web閲覧端末";
  if (!/^\d{8}$/.test(code)) {
    message("pairMessage", "8桁の登録コードを入力してください。");
    return;
  }
  $("claim").disabled = true;
  message("pairMessage", "Android端末と登録枠を確認しています…", true);
  try {
    const result = await api("claim_device", { code, controllerName });
    const device = {
      deviceId: result.deviceId,
      deviceName: result.deviceName || "Android端末",
      controllerId: result.controllerId || "",
      controllerName: result.controllerName || controllerName,
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
    $("viewerCount").textContent = "閲覧端末: " + (result.viewerCount || 1) + "/" + (result.maxViewers || 3);
    toast("このブラウザーを閲覧端末として登録しました。");
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
  S.statsFreezeCount = 0;
  S.hasReceivedVideoFrame = false;
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
    if (!previous && current.frames > 0) S.hasReceivedVideoFrame = true;
    const rttMs = candidatePair && Number.isFinite(Number(candidatePair.currentRoundTripTime))
      ? Math.round(Number(candidatePair.currentRoundTripTime) * 1000) : null;
    if (!previous) {
      $("connectionMetrics").textContent = "通信状態：測定中";
      return;
    }
    const elapsed = Math.max(0.2, (current.timestamp - previous.timestamp) / 1000);
    const bitrate = Math.max(0, (current.bytes - previous.bytes) * 8 / elapsed / 1000);
    const decodedDelta = Math.max(0, current.frames - previous.frames);
    const fps = decodedDelta / elapsed;
    if (decodedDelta > 0) {
      S.hasReceivedVideoFrame = true;
      S.lastVideoFrameAt = Date.now();
      $("videoState").textContent = "映像受信中";
      S.statsFreezeCount = 0;
    } else if (S.hasReceivedVideoFrame) {
      // Only report a freeze after at least one remote frame has arrived.
      // This prevents a slow first-frame negotiation from triggering retries.
      S.statsFreezeCount += 1;
    } else {
      S.statsFreezeCount = 0;
    }
    if (!S.videoUsesFrameCallback && S.statsFreezeCount >= 3 && pc.connectionState === "connected") {
      toast("映像フレームが止まっています。接続を再構築します。");
      scheduleReconnect(pc, true);
      return;
    }
    const receivedDelta = Math.max(0, current.packetsReceived - previous.packetsReceived);
    const lostDelta = Math.max(0, current.packetsLost - previous.packetsLost);
    const loss = receivedDelta + lostDelta > 0 ? lostDelta / (receivedDelta + lostDelta) * 100 : 0;
    const grade = loss > 8 || (rttMs !== null && rttMs > 500) || fps < 8
      ? "不安定" : loss > 3 || (rttMs !== null && rttMs > 280) || fps < 17 ? "注意" : "良好";
    updateAdaptiveQuality(loss, fps, rttMs);
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

function scheduleReconnect(failedPeer, forceReconnect = false, initialWait = null) {
  if (S.manualDisconnect || !S.device || S.reconnectTimer) return;
  const waits = [2500, 5000, 10000, 15000, 20000];
  if (S.reconnectAttempts >= waits.length) {
    toast("自動再接続を終了しました。回線とAndroidの待機状態を確認してください。");
    return;
  }
  const attempt = S.reconnectAttempts + 1;
  const wait = initialWait === null ? waits[S.reconnectAttempts] : initialWait;
  status("再接続を準備中", false);
  $("streamState").textContent = "再接続 " + attempt + "/" + waits.length;
  S.reconnectTimer = setTimeout(async () => {
    S.reconnectTimer = null;
    if (S.manualDisconnect || !S.device || (failedPeer && S.pc !== failedPeer)) return;
    if (failedPeer && failedPeer.connectionState === "connected" && !forceReconnect) return;
    S.reconnectAttempts = attempt;
    await disconnect(false, true);
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
    const isFullscreen = document.fullscreenElement ||
      document.webkitFullscreenElement || video.webkitDisplayingFullscreen;
    if (isFullscreen) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (video.webkitExitFullscreen) video.webkitExitFullscreen();
      window.setTimeout(restoreRemotePlayback, 350);
    } else if (pane.requestFullscreen) {
      await pane.requestFullscreen();
    } else if (pane.webkitRequestFullscreen) {
      pane.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      // iOS native video fullscreen is a last-resort path. Keep the same stream
      // attached and explicitly resume it when webkitendfullscreen fires.
      video.webkitEnterFullscreen();
    } else {
      toast("このブラウザーは全画面表示に対応していません。");
    }
  } catch (error) {
    toast("全画面表示に失敗しました: " + error.message);
  }
}

function restoreRemotePlayback() {
  const video = $("remoteVideo");
  if (!S.pc || !S.remoteVideoStream || S.pc.connectionState === "closed") return;
  try {
    if (video.srcObject !== S.remoteVideoStream) video.srcObject = S.remoteVideoStream;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    if (S.audioContext && S.audioContext.state === "suspended") {
      S.audioContext.resume().catch(error => console.debug("AudioContext resume failed", error));
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        $("videoState").textContent = "映像は接続中です。画面をタップして再生してください。";
      });
    }
  } catch (error) {
    console.debug("Remote video resume failed", error);
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

function prepareAudioOutput() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    if (!S.audioContext) {
      S.audioContext = new AudioContextClass();
      S.remoteGain = S.audioContext.createGain();
      S.remoteGain.gain.value = S.receiveVolume / 100;
      S.remoteGain.connect(S.audioContext.destination);
    }
    if (S.audioContext.state === "suspended") {
      S.audioContext.resume().catch(error => console.debug("AudioContext resume failed", error));
    }
    return true;
  } catch (error) {
    console.warn("Web Audio output setup failed", error);
    return false;
  }
}

function attachRemoteAudio() {
  const liveTracks = S.remoteAudioTracks.filter(track => track.readyState === "live");
  if (!liveTracks.length) {
    stopAudioMeter();
    $("audioState").textContent = "Androidマイク待機中";
    return;
  }
  if (!prepareAudioOutput()) {
    $("remoteVideo").muted = false;
    setReceiveVolume(S.receiveVolume, false);
    $("audioState").textContent = S.receiveVolume > 100
      ? "Androidマイク受信中（この環境では受信音量100%まで）"
      : "Androidマイク受信中（Safari標準音声）";
    return;
  }
  try {
    if (S.remoteAudioSource) {
      try { S.remoteAudioSource.disconnect(); } catch (_) {}
      S.remoteAudioSource = null;
    }
    stopAudioMeter();
    const audioStream = new MediaStream(liveTracks);
    S.remoteAudioSource = S.audioContext.createMediaStreamSource(audioStream);
    S.remoteAnalyser = S.audioContext.createAnalyser();
    S.remoteAnalyser.fftSize = 512;
    S.remoteAudioSource.connect(S.remoteAnalyser);
    S.remoteAnalyser.connect(S.remoteGain);
    startAudioMeter();
    $("remoteVideo").muted = true;
    $("audioState").textContent = "Androidマイク受信中";
    if (S.audioContext.state === "suspended") {
      S.audioContext.resume().catch(error => console.debug("Android audio resume failed", error));
    }
  } catch (error) {
    console.warn("Remote audio routing failed; falling back to media element", error);
    $("remoteVideo").muted = false;
    $("audioState").textContent = "Androidマイク受信中（標準音声へ切替）";
  }
}

function startAudioMeter() {
  if (!S.remoteAnalyser || S.audioMeterFrame !== null) return;
  const data = new Uint8Array(S.remoteAnalyser.fftSize);
  const tick = () => {
    if (!S.remoteAnalyser) { S.audioMeterFrame = null; return; }
    S.remoteAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) { const sample = (value - 128) / 128; sum += sample * sample; }
    const rms = Math.sqrt(sum / data.length);
    $("audioLevel").value = Math.min(1, rms * 3);
    $("audioLevelText").textContent = rms < 0.008 ? "静か" : rms < 0.04 ? "小さい音" : rms < 0.16 ? "音声受信中" : "大きな音";
    S.audioMeterFrame = requestAnimationFrame(tick);
  };
  S.audioMeterFrame = requestAnimationFrame(tick);
}
function stopAudioMeter() {
  if (S.audioMeterFrame !== null) cancelAnimationFrame(S.audioMeterFrame);
  S.audioMeterFrame = null;
  if (S.remoteAnalyser) {
    try { S.remoteAnalyser.disconnect(); } catch (_) {}
  }
  S.remoteAnalyser = null;
  $("audioLevel").value = 0;
  $("audioLevelText").textContent = "待機中";
}
function handleControlMessage(raw) {
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch (error) { console.debug("Invalid control-channel response", error); return; }
  if (!data || typeof data !== "object") return;
  if (data.type === "device_status") {
    const battery = Number(data.batteryPercent);
    const batteryText = Number.isFinite(battery) && battery >= 0 ? battery + "%" : "取得不可";
    const temperature = Number(data.batteryTempC);
    const tempText = Number.isFinite(temperature) ? " / " + temperature.toFixed(1) + "℃" : "";
    $("androidStatus").textContent =
      "Android電池 " + batteryText + (data.charging ? "・充電中" : "") + tempText +
      " / " + (data.cameraFacing === "front" ? "前面カメラ" : "背面カメラ") +
      " / ライト " + (data.flashlightOn ? "ON" : "OFF");
    S.flashlightOn = !!data.flashlightOn;
    updateFlashlightButton(!!data.flashlightAvailable, S.flashlightOn);
    return;
  }
  if (data.type === "command_result") {
    if (data.name === "flashlight") {
      if (data.success) {
        S.flashlightOn = !!(data.payload && data.payload.enabled);
        toast(S.flashlightOn ? "AndroidライトをONにしました。" : "AndroidライトをOFFにしました。");
        requestDeviceStatus().catch(() => {});
      } else {
        toast("ライトを切り替えできませんでした。背面カメラとライト対応を確認してください。");
      }
    }
  }
}

function updateFlashlightButton(available, enabled) {
  const button = $("flashlight");
  button.disabled = !S.pc || !available;
  button.classList.toggle("active", enabled);
  button.textContent = enabled ? "🔦 ライト ON" : "🔦 ライト OFF";
  button.title = available ? "Android背面カメラのライトを切り替えます" : "この端末ではライトを利用できません";
}

async function requestDeviceStatus() {
  if (!S.controlChannel || S.controlChannel.readyState !== "open") {
    throw new Error("端末情報の取得にはWebRTC接続が必要です。");
  }
  S.controlChannel.send(JSON.stringify({
    type: "command", name: "get_device_status", payload: {}, requestId: rid(), sentAt: Date.now()
  }));
}

async function takeSnapshot() {
  const video = $("remoteVideo");
  if (!S.pc || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return toast("保存できる映像がまだありません。");
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("画像処理を開始できません。");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("画像データを作成できませんでした。");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "remote-camera-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast("静止画をPNGで保存しました。");
  } catch (error) {
    toast("静止画を保存できません：" + error.message);
  }
}

async function toggleFlashlight() {
  if (!S.pc) return toast("先にAndroidへ接続してください。");
  const next = !S.flashlightOn;
  try {
    const result = await sendControlCommand("flashlight", { enabled: next });
    if (result.delivered === "webrtc") {
      toast("Androidライトの切替要求を送信しました。");
    } else {
      S.flashlightOn = next;
      updateFlashlightButton(true, next);
      toast("ライト切替要求をGAS経由で送信しました。");
      setTimeout(() => requestDeviceStatus().catch(() => {}), 1800);
    }
  } catch (error) {
    toast("ライト操作に失敗しました：" + error.message);
  }
}

async function enableScreenWakeLock() {
  if (!navigator.wakeLock || typeof navigator.wakeLock.request !== "function") {
    toast("このブラウザーは画面スリープ防止に対応していません。");
    return false;
  }
  try {
    S.wakeLock = await navigator.wakeLock.request("screen");
    S.wakeLock.addEventListener("release", () => {
      S.wakeLock = null;
      $("keepAwake").classList.remove("active");
      $("keepAwake").textContent = "画面スリープ防止 OFF";
    });
    $("keepAwake").classList.add("active");
    $("keepAwake").textContent = "画面スリープ防止 ON";
    return true;
  } catch (error) {
    S.wakeLock = null;
    toast("画面スリープ防止を開始できません：" + error.message);
    return false;
  }
}

async function toggleScreenWakeLock() {
  S.keepAwakeWanted = !S.keepAwakeWanted;
  if (!S.keepAwakeWanted) {
    if (S.wakeLock) {
      try { await S.wakeLock.release(); } catch (_) {}
      S.wakeLock = null;
    }
    $("keepAwake").classList.remove("active");
    $("keepAwake").textContent = "画面スリープ防止 OFF";
    return;
  }
  const ok = await enableScreenWakeLock();
  if (!ok) S.keepAwakeWanted = false;
}

function updateAdaptiveQuality(loss, fps, rttMs) {
  if (!S.pc || $("dataMode").value !== "auto") return;
  const modes = ["ultra", "save", "standard", "high"];
  const currentIndex = Math.max(0, modes.indexOf(S.appliedAdaptiveMode));
  const now = Date.now();
  let nextIndex = currentIndex;
  const severe = loss > 8 || fps < 9 || (rttMs !== null && rttMs > 500);
  const warning = loss > 4 || fps < 15 || (rttMs !== null && rttMs > 320);
  if (severe) {
    nextIndex = Math.max(0, currentIndex - 1);
    S.adaptiveStableSince = 0;
  } else if (warning) {
    nextIndex = Math.max(0, currentIndex - 1);
    S.adaptiveStableSince = 0;
  } else {
    if (!S.adaptiveStableSince) S.adaptiveStableSince = now;
    if (now - S.adaptiveStableSince > 35000) nextIndex = Math.min(modes.length - 1, currentIndex + 1);
  }
  if (nextIndex === currentIndex || now - S.adaptiveLastChangeAt < 12000) return;
  if (!S.controlChannel || S.controlChannel.readyState !== "open") return;
  S.appliedAdaptiveMode = modes[nextIndex];
  S.adaptiveLastChangeAt = now;
  sendControlCommand("quality", {
    quality: $("quality").value,
    dataMode: S.appliedAdaptiveMode,
    captureRatio: $("captureRatio").value,
    fpsLimit: Number($("fpsLimit").value)
  }).then(() => {
    $("connectionMetrics").textContent += " / 自動画質：" + S.appliedAdaptiveMode;
  }).catch(error => console.debug("Adaptive quality command failed", error));
}

function setReceiveVolume(value, persist = true) {
  S.receiveVolume = Math.max(0, Math.min(200, Number(value) || 0));
  $("volume").value = String(S.receiveVolume);
  $("volumeValue").textContent = S.receiveVolume + "%";
  if (S.remoteGain && S.audioContext) {
    S.remoteGain.gain.setTargetAtTime(S.receiveVolume / 100, S.audioContext.currentTime, 0.035);
  } else if ($("remoteVideo")) {
    try { $("remoteVideo").volume = Math.min(100, S.receiveVolume) / 100; } catch (_) {}
  }
  if (persist) {
    try { localStorage.setItem("rc_receive_volume_v1", String(S.receiveVolume)); } catch (_) {}
  }
}

function stopVideoWatchdog() {
  if (S.videoWatchdogTimer) clearInterval(S.videoWatchdogTimer);
  S.videoWatchdogTimer = null;
  if (S.videoFrameCallbackId !== null && $("remoteVideo").cancelVideoFrameCallback) {
    try { $("remoteVideo").cancelVideoFrameCallback(S.videoFrameCallbackId); } catch (_) {}
  }
  S.videoFrameCallbackId = null;
  S.videoUsesFrameCallback = false;
  S.lastVideoFrameAt = 0;
  S.hasReceivedVideoFrame = false;
}

function startVideoWatchdog(pc) {
  if (S.pc === pc && S.videoWatchdogTimer) return;
  stopVideoWatchdog();
  $("videoState").textContent = "映像の初回フレーム待ち";
  S.hasReceivedVideoFrame = false;
  S.lastVideoFrameAt = 0;
  const video = $("remoteVideo");
  const onFrame = () => {
    if (S.pc !== pc) return;
    S.hasReceivedVideoFrame = true;
    S.lastVideoFrameAt = Date.now();
    $("videoState").textContent = "映像受信中";
    if (typeof video.requestVideoFrameCallback === "function") {
      S.videoUsesFrameCallback = true;
      S.videoFrameCallbackId = video.requestVideoFrameCallback(onFrame);
    }
  };
  if (typeof video.requestVideoFrameCallback === "function") {
    S.videoUsesFrameCallback = true;
    S.videoFrameCallbackId = video.requestVideoFrameCallback(onFrame);
  }
  S.videoWatchdogTimer = setInterval(() => {
    if (S.pc !== pc || pc.connectionState !== "connected") return;
    const now = Date.now();
    if (!S.hasReceivedVideoFrame) {
      const connectedFor = S.connectedAt ? now - S.connectedAt : 0;
      if (connectedFor > 15000) {
        $("videoState").textContent = "映像未着信・再接続中";
        toast("通信は接続中ですが映像が届きません。映像接続を再構築します。");
        scheduleReconnect(pc, true, 1200);
      }
    } else if (now - S.lastVideoFrameAt > 8000) {
      $("videoState").textContent = "映像フリーズ・再接続中";
      toast("映像フレームが8秒以上停止しました。接続を再構築します。");
      scheduleReconnect(pc, true, 1200);
    }
  }, 2000);
}

const MOTION_STORAGE_KEY = "rc_motion_events_v42";
function readMotionEvents() {
  try {
    const value = JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 12) : [];
  } catch (_) { return []; }
}
function saveMotionEvents() {
  try { localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify(S.motionEvents.slice(0, 12))); }
  catch (_) {
    S.motionEvents = S.motionEvents.slice(0, 12).map(event => ({ ...event, image: "" }));
    try { localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify(S.motionEvents)); } catch (_) {}
  }
}
function stopMotionDetection(keepEnabled = true) {
  if (S.motionTimer) clearInterval(S.motionTimer);
  S.motionTimer = null;
  S.motionPrevious = null;
  if (!keepEnabled) $("motionState").textContent = "動体検知 OFF";
}
function startMotionDetection() {
  if (S.motionTimer || !S.pc) return;
  $("motionState").textContent = "映像を解析中…";
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 90;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    $("motionState").textContent = "このブラウザーは画像解析に対応していません";
    return;
  }
  S.motionTimer = setInterval(() => {
    const video = $("remoteVideo");
    if (!S.pc || document.hidden || video.readyState < 2 || !video.videoWidth) return;
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!S.motionPrevious) {
        S.motionPrevious = new Uint8ClampedArray(pixels);
        return;
      }
      let changed = 0;
      const count = pixels.length / 4;
      for (let i = 0; i < pixels.length; i += 4) {
        const diff = Math.abs(pixels[i] - S.motionPrevious[i]) +
          Math.abs(pixels[i + 1] - S.motionPrevious[i + 1]) +
          Math.abs(pixels[i + 2] - S.motionPrevious[i + 2]);
        if (diff > 54) changed++;
      }
      S.motionPrevious = new Uint8ClampedArray(pixels);
      const ratio = changed / count;
      const threshold = ({ low: 0.16, normal: 0.09, high: 0.045 })[$("motionSensitivity").value] || 0.09;
      $("motionState").textContent = "解析中 · 変化 " + (ratio * 100).toFixed(1) + "%";
      if (ratio >= threshold && Date.now() - S.motionLastTriggered >= 10000) {
        recordMotionEvent(ratio);
      }
    } catch (error) {
      $("motionState").textContent = "解析エラー";
      console.debug("Motion analysis", error);
    }
  }, 700);
}
function recordMotionEvent(ratio) {
  S.motionLastTriggered = Date.now();
  const event = {
    timestamp: new Date().toISOString(),
    ratio: ratio,
    sensitivity: $("motionSensitivity").value,
    image: ""
  };
  try {
    const video = $("remoteVideo");
    if (video.videoWidth && video.videoHeight) {
      const image = document.createElement("canvas");
      const scale = Math.min(1, 320 / video.videoWidth);
      image.width = Math.max(1, Math.round(video.videoWidth * scale));
      image.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = image.getContext("2d");
      ctx.drawImage(video, 0, 0, image.width, image.height);
      event.image = image.toDataURL("image/jpeg", 0.55);
    }
  } catch (error) {
    console.debug("Motion snapshot skipped", error);
  }
  S.motionEvents.unshift(event);
  S.motionEvents = S.motionEvents.slice(0, 12);
  saveMotionEvents();
  $("motionState").textContent = "⚠ 動きを検知 " + new Date(event.timestamp).toLocaleTimeString();
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("Remote Camera：動体を検知", { body: new Date(event.timestamp).toLocaleString() }); } catch (_) {}
  }
  toast("動体を検知しました。イベント履歴に保存しました。");
}
async function requestMotionNotifications() {
  if (!("Notification" in window)) return toast("このブラウザーは通知に対応していません。");
  try {
    const permission = await Notification.requestPermission();
    toast(permission === "granted" ? "動体検知の通知を許可しました。" : "通知は許可されませんでした。");
  } catch (_) { toast("通知許可を取得できませんでした。"); }
}
function renderMotionEvents() {
  const host = $("motionRows");
  host.replaceChildren();
  if (!S.motionEvents.length) {
    const empty = document.createElement("p");
    empty.textContent = "検知イベントはありません。";
    host.appendChild(empty);
    return;
  }
  for (const event of S.motionEvents) {
    const row = document.createElement("div");
    row.className = "motionrow";
    const detail = document.createElement("span");
    detail.textContent = new Date(event.timestamp).toLocaleString() +
      " · 画面変化 " + (Number(event.ratio) * 100).toFixed(1) + "%";
    row.appendChild(detail);
    if (event.image) {
      const link = document.createElement("a");
      link.href = event.image;
      link.download = "remote-camera-motion-" + event.timestamp.replace(/[:.]/g, "-") + ".jpg";
      link.textContent = "静止画を保存";
      row.appendChild(link);
    }
    host.appendChild(row);
  }
}
function showMotionEvents() {
  renderMotionEvents();
  $("motionDialog").showModal();
}
function exportMotionEvents() {
  const rows = [["timestamp","change_ratio","sensitivity"]];
  S.motionEvents.forEach(event => rows.push([
    event.timestamp, Number(event.ratio).toFixed(4), event.sensitivity
  ]));
  const csv = "\uFEFF" + rows.map(row => row.map(value =>
    '"' + String(value).replace(/"/g, '""') + '"'
  ).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "remote-camera-motion-events.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  // Resume/create Web Audio while the Connect button still has user activation on iOS.
  prepareAudioOutput();
  if (S.pc) await disconnect(false);
  try {
    // Reuse the already-authorized microphone stream across automatic retries.
    // Re-requesting getUserMedia during a reconnect can be blocked by mobile Safari
    // when the page no longer has a fresh user gesture.
    let stream = S.mic;
    let localAudioTrack = stream && stream.getAudioTracks()
      .find(track => track.readyState === "live");
    if (!localAudioTrack) {
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      S.mic = stream;
      localAudioTrack = stream.getAudioTracks()[0] || null;
    }
    if (!localAudioTrack) throw new Error("マイク音声トラックを作成できませんでした。");
    S.pttActive = false;
    localAudioTrack.enabled = false;
    S.session = rid();
    S.seq = 0;
    S.statsFreezeCount = 0;
    S.hasReceivedVideoFrame = false;
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
    S.remoteVideoStream = new MediaStream();
    $("remoteVideo").muted = true;
    $("remoteVideo").srcObject = S.remoteVideoStream;
    prepareAudioOutput();
    const controlChannel = pc.createDataChannel("remote-control", { ordered: true });
    S.controlChannel = controlChannel;
    controlChannel.onopen = () => {
      $("streamState").textContent = "操作用データチャネル接続済み";
      S.appliedAdaptiveMode = $("dataMode").value === "auto" ? "standard" : $("dataMode").value;
      sendControlCommand("quality", {
        quality: $("quality").value,
        dataMode: $("dataMode").value === "auto" ? "standard" : $("dataMode").value,
        captureRatio: $("captureRatio").value,
        fpsLimit: Number($("fpsLimit").value)
      }).catch(error => console.debug("Initial capture profile send failed", error));
      $("refreshStatus").disabled = false;
      requestDeviceStatus().catch(error => console.debug("Android status request failed", error));
      if (S.androidStatusTimer) clearInterval(S.androidStatusTimer);
      S.androidStatusTimer = setInterval(() => {
        requestDeviceStatus().catch(error => console.debug("Periodic status request failed", error));
      }, 60000);
    };
    controlChannel.onmessage = event => handleControlMessage(event.data);
    controlChannel.onclose = () => {
      if (S.controlChannel === controlChannel) S.controlChannel = null;
      if (S.androidStatusTimer) clearInterval(S.androidStatusTimer);
      S.androidStatusTimer = null;
    };
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTrack(localAudioTrack, stream);
    pc.ontrack = event => {
      const track = event.track;
      if (track.kind === "video") {
        if (!S.remoteVideoStream.getTracks().some(existing => existing.id === track.id)) {
          S.remoteVideoStream.addTrack(track);
        }
        track.onmute = () => { $("videoState").textContent = "映像一時停止"; };
        track.onunmute = () => { $("videoState").textContent = "映像再開中"; };
        track.onended = () => {
          $("videoState").textContent = "映像トラック終了";
          scheduleReconnect(pc, true, 1200);
        };
        $("placeholder").classList.add("hidden");
        $("snapshot").disabled = false;
        startVideoWatchdog(pc);
        restoreRemotePlayback();
        if ($("motionEnabled").checked) startMotionDetection();
      } else if (track.kind === "audio") {
        if (!S.remoteAudioTracks.some(existing => existing.id === track.id)) {
          track.enabled = !S.pttActive && !S.remoteAudioMuted;
          track.onmute = () => { $("audioState").textContent = "Androidマイク一時停止"; };
          track.onunmute = () => {
            $("audioState").textContent = "Androidマイク受信中";
            attachRemoteAudio();
          };
          track.onended = () => { $("audioState").textContent = "Androidマイク切断"; };
          S.remoteAudioTracks.push(track);
        }
        attachRemoteAudio();
      }
    };
    pc.onconnectionstatechange = () => {
      if (S.pc !== pc) return;
      const state = pc.connectionState;
      $("iceState").textContent = "ICE: " + state;
      status(state === "connected" ? "通信接続済み" : state, state === "connected");
      $("streamState").textContent = state === "connected" ? "通信チャネル接続中" : "接続処理中";
      if (state === "connected") {
        sendControlCommand("volume", { percent: S.androidSpeakerVolume }).catch(error => {
          console.debug("Android speaker volume sync failed", error);
        });
        if (S.reconnectTimer) clearTimeout(S.reconnectTimer);
        S.reconnectTimer = null;
        if (S.reconnectResetTimer) clearTimeout(S.reconnectResetTimer);
        // Reset the retry budget only after a genuinely stable connection.
        S.reconnectResetTimer = setTimeout(() => {
          if (S.pc === pc && pc.connectionState === "connected") {
            S.reconnectAttempts = 0;
          }
          S.reconnectResetTimer = null;
        }, 30000);
        startSessionClock();
        startViewerHeartbeat();
        startStatsMonitor(pc);
        startVideoWatchdog(pc);
        if ($("motionEnabled").checked) startMotionDetection();
      } else if (state === "failed" || state === "disconnected" || state === "closed") {
        if (state === "disconnected") $("streamState").textContent = "通信が不安定です・復帰確認中";
        if (S.reconnectResetTimer) clearTimeout(S.reconnectResetTimer);
        S.reconnectResetTimer = null;
        if (S.connectedAt) stopSessionClock();
        scheduleReconnect(pc, false, state === "disconnected" ? 8000 : 1500);
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
    $("pttLock").disabled = false;
    $("remoteMute").disabled = false;
    $("androidSpeakerVolume").disabled = false;
    $("streamState").textContent = "Android応答待ち";
    status("接続要求中");
    pollAnswers();
  } catch (error) {
    const permissionDenied = error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" || error.name === "SecurityError";
    await disconnect(false, !permissionDenied);
    toast("接続開始失敗: " + error.message);
    if (permissionDenied) {
      S.manualDisconnect = true;
    } else {
      scheduleReconnect(null);
    }
  }
}
function startViewerHeartbeat() {
  if (S.viewerHeartbeatTimer || !S.device) return;
  const ping = () => {
    if (!S.device || !S.pc || S.manualDisconnect) return;
    api("viewer_ping", {
      controllerToken: S.device.controllerToken,
      deviceId: S.device.deviceId
    }).catch(error => console.debug("Viewer heartbeat failed", error));
  };
  ping();
  S.viewerHeartbeatTimer = setInterval(ping, 30000);
}
function stopViewerHeartbeat() {
  if (S.viewerHeartbeatTimer) clearInterval(S.viewerHeartbeatTimer);
  S.viewerHeartbeatTimer = null;
}

async function pollAnswers() {
  const startedAt = Date.now();
  while (S.pc && S.session && S.device) {
    if (Date.now() - startedAt > 45000 && S.pc.connectionState !== "connected") {
      toast("45秒以内にAndroidから応答がありません。接続をやり直します。");
      scheduleReconnect(S.pc);
      return;
    }
    try {
      const result = await api("poll_signals", {
        controllerToken: S.device.controllerToken,
        deviceId: S.device.deviceId,
        sessionId: S.session,
        afterSeq: S.seq
      });
      S.seq = Math.max(S.seq, Number(result.latestSeq) || 0);
      for (const signal of result.signals || []) {
        S.seq = Math.max(S.seq, Number(signal.seq) || 0);
        if (signal.kind === "answer" && !S.pc.remoteDescription) {
          await S.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          // Non-trickle ICE: no further GAS signal polling is needed after the complete answer.
          return;
        } else if (signal.kind === "error") {
          toast(signal.sdp || "Android側で接続エラーが発生しました。");
        }
      }
    } catch (error) {
      console.warn("pollAnswers", error);
      if (error.serverMs !== null && error.serverMs !== undefined) {
        $("gasTiming").textContent = "GAS処理 " + error.serverMs + " ms / API " + (error.apiVersion || "?");
      } else {
        $("gasTiming").textContent = "GAS応答なし（サーバー処理時間不明）";
      }
      if (S.pc && S.pc.connectionState === "failed") {
        scheduleReconnect(S.pc);
        return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, Number(S.cfg.pollIntervalMs) || 2500));
  }
}
async function disconnect(sendCommand = true, preserveMic = false) {
  if (sendCommand) {
    S.manualDisconnect = true;
    if (S.reconnectTimer) clearTimeout(S.reconnectTimer);
    S.reconnectTimer = null;
  }
  stopStatsMonitor();
  stopViewerHeartbeat();
  stopVideoWatchdog();
  stopMotionDetection(true);
  stopSessionClock();
  if (S.reconnectResetTimer) clearTimeout(S.reconnectResetTimer);
  S.reconnectResetTimer = null;
  if (sendCommand && S.pc && S.device) {
    // Prefer peer-to-peer control; only use GAS when the data channel is not open.
    if (S.controlChannel && S.controlChannel.readyState === "open") {
      try {
        S.controlChannel.send(JSON.stringify({
          type: "command", name: "disconnect", payload: {}, sentAt: Date.now()
        }));
      } catch (error) {
        console.warn("Data-channel disconnect failed; using GAS fallback", error);
        api("send_command", {
          controllerToken: S.device.controllerToken,
          deviceId: S.device.deviceId,
          command: "disconnect",
          payload: {}
        }).catch(() => {});
      }
    } else {
      const signal = {
        controllerToken: S.device.controllerToken,
        deviceId: S.device.deviceId,
        sessionId: S.session,
        recipient: "device",
        kind: "bye"
      };
      api("send_signal", signal).catch(() => {});
    }
  }
  const old = S.pc;
  S.pc = null;
  S.session = "";
  try { if (old) old.close(); } catch (_) {}
  if (S.controlChannel) {
    try { S.controlChannel.close(); } catch (_) {}
    S.controlChannel = null;
  }
  if (S.remoteAudioSource) {
    try { S.remoteAudioSource.disconnect(); } catch (_) {}
    S.remoteAudioSource = null;
  }
  if (S.androidStatusTimer) clearInterval(S.androidStatusTimer);
  S.androidStatusTimer = null;
  if (S.wakeLock) {
    try { await S.wakeLock.release(); } catch (_) {}
    S.wakeLock = null;
  }
  S.keepAwakeWanted = false;
  $("keepAwake").classList.remove("active");
  $("keepAwake").textContent = "画面スリープ防止 OFF";
  S.flashlightOn = false;
  updateFlashlightButton(false, false);
  $("androidStatus").textContent = "Android情報：未取得";
  $("audioState").textContent = "Androidマイク待機中";
  S.remoteAudioTracks = [];
  S.remoteVideoStream = null;
  if (S.mic) {
    if (preserveMic) {
      S.mic.getAudioTracks().forEach(track => { track.enabled = false; });
    } else {
      S.mic.getTracks().forEach(track => track.stop());
      S.mic = null;
    }
  }
  S.pttActive = false;
  if (S.pttSafetyTimer) clearTimeout(S.pttSafetyTimer);
  S.pttSafetyTimer = null;
  S.remoteAudioTracks = [];
  $("remoteVideo").srcObject = null;
  $("remoteVideo").muted = true;
  $("snapshot").disabled = true;
  $("refreshStatus").disabled = true;
  $("videoState").textContent = "映像待機中";
  $("placeholder").classList.remove("hidden");
  $("connect").disabled = !S.device;
  $("disconnect").disabled = true;
  $("camera").disabled = true;
  $("ptt").disabled = true;
  $("pttLock").disabled = true;
  $("remoteMute").disabled = true;
  $("androidSpeakerVolume").disabled = true;
  S.pttLocked = false;
  S.remoteAudioMuted = false;
  $("pttLock").textContent = "送話ロック OFF";
  $("remoteMute").textContent = "🔊 Android音声 ON";
  stopAudioMeter();
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
  if (!track) {
    if (S.pttSafetyTimer) clearTimeout(S.pttSafetyTimer);
    S.pttSafetyTimer = null;
    S.pttActive = false;
    if ($("ptt")) {
      $("ptt").classList.remove("active");
      $("ptt").textContent = "🎙 押している間だけ話す";
    }
    return;
  }
  if (S.pttSafetyTimer) clearTimeout(S.pttSafetyTimer);
  S.pttSafetyTimer = null;
  S.pttActive = enabled;
  track.enabled = enabled;
  // Half-duplex: mute the Android return audio while sending PTT audio.
  S.remoteAudioTracks.forEach(remoteTrack => { remoteTrack.enabled = !enabled && !S.remoteAudioMuted; });
  $("ptt").classList.toggle("active", enabled);
  $("ptt").textContent = enabled ? "🎙 送話中…" : "🎙 押している間だけ話す";
  if (enabled) {
    // Safety release prevents a stuck pointer or forgotten PTT lock from transmitting indefinitely.
    S.pttSafetyTimer = setTimeout(() => {
      S.pttLocked = false;
      $("pttLock").textContent = "送話ロック OFF";
      ptt(false);
      toast("安全のため送話を自動停止しました（3分）。");
    }, 180000);
  }
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
  $("captureRatio").value = settings.captureRatio || "16:9";
  $("fpsLimit").value = String(settings.fpsLimit || 24);
  S.captureRatio = $("captureRatio").value;
  S.fpsLimit = Number($("fpsLimit").value);
  $("connectedLoc").checked = !!settings.connectedLocationEnabled;
  $("idleLoc").checked = !!settings.idleLocationEnabled;
  $("connectedInterval").value = String(settings.connectedInterval || 30);
  $("idleInterval").value = String(settings.idleInterval || 300);
}
async function saveSettings() {
  if (!S.device) return toast("Android端末をペアリングしてください。");
  S.captureRatio = $("captureRatio").value;
  S.fpsLimit = Number($("fpsLimit").value);
  const settings = {
    quality: $("quality").value,
    dataMode: $("dataMode").value,
    captureRatio: S.captureRatio,
    fpsLimit: S.fpsLimit,
    connectedLocationEnabled: $("connectedLoc").checked,
    idleLocationEnabled: $("idleLoc").checked,
    connectedInterval: Number($("connectedInterval").value),
    idleInterval: Number($("idleInterval").value)
  };

  // Apply changes over the active peer before starting a background GAS write.
  const direct = !!(S.controlChannel && S.controlChannel.readyState === "open");
  if (direct) {
    await sendControlCommand("quality", {
      quality: settings.quality,
      dataMode: settings.dataMode === "auto" ? "standard" : settings.dataMode,
      captureRatio: settings.captureRatio,
      fpsLimit: settings.fpsLimit
    });
    await sendControlCommand("location_settings", settings);
    toast("Androidに設定を反映しました。GASへ保存中…");
    S.settingsSaveChain = S.settingsSaveChain
      .catch(() => {})
      .then(() => api("save_settings", {
        controllerToken: S.device.controllerToken,
        deviceId: S.device.deviceId,
        settings
      }));
    S.settingsSaveChain.then(() => toast("設定を反映し、GASにも保存しました。"))
      .catch(error => toast("Androidには反映済みですが、GAS保存に失敗しました：" + error.message));
    return;
  }

  S.settingsSaveChain = S.settingsSaveChain
    .catch(() => {})
    .then(() => api("save_settings", {
      controllerToken: S.device.controllerToken,
      deviceId: S.device.deviceId,
      settings
    }));
  await S.settingsSaveChain;
  await sendControlCommand("quality", {
    quality: settings.quality,
    dataMode: settings.dataMode === "auto" ? "standard" : settings.dataMode,
    captureRatio: settings.captureRatio,
    fpsLimit: settings.fpsLimit
  });
  await sendControlCommand("location_settings", settings);
  toast("設定を保存しました。");
}
async function sendControlCommand(name, payload = {}) {
  if (S.controlChannel && S.controlChannel.readyState === "open") {
    const requestId = rid();
    S.controlChannel.send(JSON.stringify({
      type: "command",
      name,
      payload,
      requestId,
      sentAt: Date.now()
    }));
    return { delivered: "webrtc", requestId };
  }
  if (!S.device) throw Error("Android端末をペアリングしてください。");
  return api("send_command", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId,
    command: name,
    payload
  });
}

async function command(name, payload = {}) {
  if (!S.device) return toast("Android端末をペアリングしてください。");
  await sendControlCommand(name, payload);
  toast(S.controlChannel && S.controlChannel.readyState === "open"
    ? "WebRTCでAndroidへ直接命令しました。"
    : "GAS経由でAndroidへ命令しました。");
}

async function unpairSelectedDevice() {
  if (!S.device) return;
  if (!confirm("このブラウザーの閲覧権限だけを解除します。他のiPad・PCの監視接続には影響しません。よろしいですか？")) return;
  const selected = S.device;
  S.manualDisconnect = true;
  if (S.reconnectTimer) clearTimeout(S.reconnectTimer);
  S.reconnectTimer = null;
  $("unpair").disabled = true;
  try {
    if (S.pc && S.session) {
      if (S.controlChannel && S.controlChannel.readyState === "open") {
        try {
          S.controlChannel.send(JSON.stringify({
            type: "command", name: "disconnect", payload: {}, sentAt: Date.now()
          }));
        } catch (_) {}
      } else {
        await api("send_signal", {
          controllerToken: selected.controllerToken,
          deviceId: selected.deviceId,
          sessionId: S.session,
          recipient: "device",
          kind: "bye"
        }).catch(() => {});
      }
    }
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
    status("このブラウザーの登録解除済み");
    toast("このブラウザーの閲覧権限だけを解除しました。");
  } catch (error) {
    toast("登録解除失敗: " + error.message);
    $("unpair").disabled = false;
  }
}

async function loadViewerList() {
  if (!S.device) return;
  const result = await api("get_controllers", {
    controllerToken: S.device.controllerToken,
    deviceId: S.device.deviceId
  });
  const rows = $("viewerRows");
  rows.replaceChildren();
  for (const viewer of result.controllers || []) {
    const row = document.createElement("div");
    row.className = "viewerrow";
    const name = document.createElement("b");
    const detail = document.createElement("small");
    name.textContent = viewer.controllerName + (viewer.current ? "（このブラウザー）" : "");
    const last = viewer.lastSeen ? new Date(viewer.lastSeen).toLocaleString() : "履歴なし";
    detail.textContent = (viewer.online ? "● オンライン確認済み" : "○ 最近の応答なし") + " · 最終確認 " + last;
    row.append(name, detail);
    rows.appendChild(row);
  }
  $("viewerCount").textContent = "閲覧端末: " + (result.viewerCount || 0) + "/" + (result.maxViewers || 3);
  $("viewerSummary").textContent = "このAndroidには最大" + (result.maxViewers || 3) +
    "台まで登録できます。登録コードはAndroid側で再発行してから、追加する端末で入力してください。";
  $("viewersDialog").showModal();
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

window.addEventListener("offline", () => {
  status("ネットワーク切断中", false);
  $("streamState").textContent = "ネットワーク復帰待ち";
});
window.addEventListener("online", () => {
  toast("ネットワークが復帰しました。接続状態を確認します。");
  if (S.pc && ["disconnected", "failed", "closed"].includes(S.pc.connectionState)) {
    scheduleReconnect(S.pc);
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (S.audioContext && S.audioContext.state === "suspended") {
    S.audioContext.resume().catch(error => console.debug("AudioContext resume failed", error));
  }
  if (S.keepAwakeWanted && !S.wakeLock) enableScreenWakeLock().catch(() => {});
  window.setTimeout(restoreRemotePlayback, 180);
  if (!S.pc) return;
  const state = S.pc.connectionState;
  if (["disconnected", "failed", "closed"].includes(state)) {
    scheduleReconnect(S.pc);
  }
});

document.addEventListener("fullscreenchange", () => window.setTimeout(restoreRemotePlayback, 180));
document.addEventListener("webkitfullscreenchange", () => window.setTimeout(restoreRemotePlayback, 180));
$("remoteVideo").addEventListener("webkitendfullscreen", () => window.setTimeout(restoreRemotePlayback, 350));
window.addEventListener("pageshow", () => window.setTimeout(restoreRemotePlayback, 180));
window.addEventListener("resize", () => {
  if (S.pc && S.remoteVideoStream) window.setTimeout(restoreRemotePlayback, 150);
});
document.addEventListener("DOMContentLoaded", async () => {
  $("refresh").addEventListener("click", refreshDeviceList);
  $("pair").addEventListener("click", () => $("pairDialog").showModal());
  $("pairQuick").addEventListener("click", () => $("pair").click());
  $("unpair").addEventListener("click", () => unpairSelectedDevice());
  $("viewers").addEventListener("click", () => loadViewerList().catch(error => toast(error.message)));
  $("claim").addEventListener("click", claimDevice);
  $("connect").addEventListener("click", connect);
  $("disconnect").addEventListener("click", () => disconnect(true));
  $("ptt").addEventListener("pointerdown", event => {
    event.preventDefault();
    try { if (event.pointerId !== undefined) $("ptt").setPointerCapture(event.pointerId); } catch (_) {}
    if (S.pttLocked) { S.pttLocked = false; $("pttLock").textContent = "送話ロック OFF"; ptt(false); return; }
    ptt(true);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => {
    $("ptt").addEventListener(name, () => { if (!S.pttLocked) ptt(false); });
  });
  $("ptt").addEventListener("keydown", event => {
    if (event.code === "Space" || event.key === "Enter") {
      event.preventDefault();
      if (!S.pttLocked) ptt(true);
    }
  });
  $("ptt").addEventListener("keyup", event => {
    if ((event.code === "Space" || event.key === "Enter") && !S.pttLocked) {
      event.preventDefault();
      ptt(false);
    }
  });
  $("pttLock").addEventListener("click", () => {
    if (!S.mic || !S.mic.getAudioTracks()[0]) return;
    S.pttLocked = !S.pttLocked;
    $("pttLock").textContent = S.pttLocked ? "🔒 送話ロック ON" : "送話ロック OFF";
    ptt(S.pttLocked);
  });
  $("remoteMute").addEventListener("click", () => {
    S.remoteAudioMuted = !S.remoteAudioMuted;
    S.remoteAudioTracks.forEach(track => { track.enabled = !S.remoteAudioMuted && !S.pttActive; });
    $("remoteMute").textContent = S.remoteAudioMuted ? "🔇 Android音声 OFF" : "🔊 Android音声 ON";
  });
  $("saveSettings").addEventListener("click", () => saveSettings().catch(error => toast(error.message)));
  $("locate").addEventListener("click", () => command("location_once").catch(error => toast(error.message)));
  $("history").addEventListener("click", () => loadHistory().catch(error => toast(error.message)));
  $("deleteHistory").addEventListener("click", () => deleteHistory().catch(error => toast(error.message)));
  S.motionEvents = readMotionEvents();
  $("motionEnabled").checked = localStorage.getItem("rc_motion_enabled_v42") === "1";
  $("motionEnabled").addEventListener("change", event => {
    const enabled = event.target.checked;
    try { localStorage.setItem("rc_motion_enabled_v42", enabled ? "1" : "0"); } catch (_) {}
    if (enabled) {
      if (S.pc) startMotionDetection();
      else $("motionState").textContent = "接続後に解析を開始します";
    } else {
      stopMotionDetection(false);
    }
  });
  $("motionNotifications").addEventListener("click", requestMotionNotifications);
  $("motionEvents").addEventListener("click", showMotionEvents);
  $("exportMotionEvents").addEventListener("click", exportMotionEvents);
  $("videoTab").addEventListener("click", showVideo);
  $("mapTab").addEventListener("click", showMap);
  $("fullscreen").addEventListener("click", toggleFullscreen);
  $("snapshot").addEventListener("click", takeSnapshot);
  $("flashlight").addEventListener("click", toggleFlashlight);
  $("keepAwake").addEventListener("click", toggleScreenWakeLock);
  $("refreshStatus").addEventListener("click", () => requestDeviceStatus()
    .then(() => toast("Android端末情報を更新しています…"))
    .catch(error => toast(error.message)));
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
  const storedVolume = localStorage.getItem("rc_receive_volume_v1");
  const savedVolume = storedVolume === null ? 70 : Number(storedVolume);
  setReceiveVolume(Number.isFinite(savedVolume) ? savedVolume : 70, false);
  $("volume").addEventListener("input", event => setReceiveVolume(Number(event.target.value), true));
  const storedAndroidSpeakerVolume = localStorage.getItem("rc_android_speaker_volume_v1");
  const savedAndroidSpeakerVolume = storedAndroidSpeakerVolume === null ? 70 : Number(storedAndroidSpeakerVolume);
  S.androidSpeakerVolume = Number.isFinite(savedAndroidSpeakerVolume)
    ? Math.max(0, Math.min(100, savedAndroidSpeakerVolume)) : 70;
  $("androidSpeakerVolume").value = String(S.androidSpeakerVolume);
  $("androidSpeakerVolumeValue").textContent = S.androidSpeakerVolume + "%";
  $("androidSpeakerVolume").addEventListener("input", event => {
    S.androidSpeakerVolume = Math.max(0, Math.min(100, Number(event.target.value) || 0));
    $("androidSpeakerVolumeValue").textContent = S.androidSpeakerVolume + "%";
    try { localStorage.setItem("rc_android_speaker_volume_v1", String(S.androidSpeakerVolume)); } catch (_) {}
  });
  $("androidSpeakerVolume").addEventListener("change", () => {
    if (!S.pc) return toast("Androidスピーカー音量は接続後に反映できます。");
    sendControlCommand("volume", { percent: S.androidSpeakerVolume })
      .then(() => toast("Android側の送話再生音量を変更しました。"))
      .catch(error => toast("Android音量変更失敗：" + error.message));
  });
  $("camera").addEventListener("change", event => {
    command("camera", { facing: event.target.value }).catch(error => toast(error.message));
  });
  $("quality").addEventListener("change", () => saveSettings().catch(error => toast(error.message)));
  $("dataMode").addEventListener("change", () => {
    S.adaptiveStableSince = 0;
    S.appliedAdaptiveMode = $("dataMode").value === "auto" ? "standard" : $("dataMode").value;
    saveSettings().catch(error => toast(error.message));
  });
  $("captureRatio").addEventListener("change", () => saveSettings().catch(error => toast(error.message)));
  $("fpsLimit").addEventListener("change", () => saveSettings().catch(error => toast(error.message)));
  $("refreshStatus").disabled = true;
  updateViewerTransform();
  try {
    await loadConfig();
    S.devices = readDevices();
    renderDevices();
    try {
      const health = await api("health");
      const expectedApiVersion = String(S.cfg.appVersion || "");
      const actualApiVersion = String(health.apiVersion || health.version || "");
      if (expectedApiVersion && actualApiVersion !== expectedApiVersion) {
        $("pair").disabled = true;
        $("pairQuick").disabled = true;
        setControlsEnabled(false);
        status("GASバージョン不一致");
        toast("Webはv" + expectedApiVersion + "、GASはv" +
          (actualApiVersion || "旧版／未対応") +
          "です。Apps ScriptのCode.gsをv" + expectedApiVersion +
          "へ更新し、新しいバージョンとして再デプロイしてください。");
      } else if (!health.databaseReady) {
        $("pair").disabled = true;
        $("pairQuick").disabled = true;
        setControlsEnabled(false);
        status("GAS接続済み・DB未設定");
        toast(health.message || "GASのsetupDatabase()を実行し、最新バージョンをデプロイしてください。");
      } else {
        $("pair").disabled = false;
        $("pairQuick").disabled = false;
        refreshDeviceList();
        status(S.device ? "ペアリング済み" : "GAS接続済み・端末未登録", true);
      }
    } catch (healthError) {
      $("pair").disabled = true;
      $("pairQuick").disabled = true;
      setControlsEnabled(false);
      status("GAS応答なし");
      toast("GASへのPOST応答を確認できません: " + (healthError && healthError.message ? healthError.message : "不明な通信エラー") + "。Code.gsの更新・再デプロイも確認してください。");
      console.error("GAS health check failed", healthError);
    }
  } catch (error) {
    $("pair").disabled = true;
    $("pairQuick").disabled = true;
    setControlsEnabled(false);
    toast(error.message);
    status("設定エラー");
  }
});
