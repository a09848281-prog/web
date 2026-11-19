(() => {
  "use strict";

  const ROOT_ID = "__remote_camera_v42_bookmarklet__";
  const APP_URL = "https://cdn.jsdelivr.net/gh/a09848281-prog/web@rebuild-v4.2-multi-viewer-camera/web/index.html?embed=bookmarklet&v=4.2.0";
  const existing = document.getElementById(ROOT_ID);

  if (existing) {
    existing.style.display = "block";
    const frame = existing.shadowRoot && existing.shadowRoot.querySelector("iframe");
    if (frame) frame.focus();
    return;
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  (document.documentElement || document.body).appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial}
    .panel{position:fixed;right:14px;bottom:14px;width:min(980px,calc(100vw - 28px));height:min(780px,calc(100dvh - 28px));min-width:280px;min-height:260px;background:#101827;border:1px solid #40516c;border-radius:16px;box-shadow:0 18px 60px #0008;overflow:hidden;display:flex;flex-direction:column;pointer-events:auto;color:#fff;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .bar{height:48px;min-height:48px;display:flex;align-items:center;gap:8px;padding:0 10px 0 14px;background:#101827;touch-action:none;user-select:none;cursor:move}
    .brand{font-weight:800;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bar button{border:0;border-radius:8px;min-width:36px;height:34px;padding:0 9px;background:#263750;color:white;font:inherit;font-weight:700;cursor:pointer}
    .bar button.open{background:#2865d6}
    .body{position:relative;flex:1;min-height:0;background:#eef2f7}
    iframe{display:block;width:100%;height:100%;border:0;background:#eef2f7}
    .panel.min{height:48px!important;min-height:48px;width:min(420px,calc(100vw - 28px))}
    .panel.min .body{visibility:hidden;position:absolute;inset:48px 0 0;pointer-events:none}
    .panel.image-fullscreen{
      inset:0!important;left:0!important;top:0!important;right:0!important;bottom:0!important;
      width:100vw!important;height:100vh!important;height:100dvh!important;
      min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;
      border:0!important;border-radius:0!important
    }
    .panel.image-fullscreen .bar{display:none!important}
    .tip{position:absolute;left:10px;bottom:10px;z-index:2;background:#101827dd;color:#fff;border-radius:8px;padding:6px 9px;font-size:11px;pointer-events:none}
    @media(max-width:640px){.panel{inset:0;width:100vw;height:100dvh;min-width:0;min-height:0;border-radius:0;border:0}.panel.min{inset:auto 8px 8px 8px;width:auto;height:48px!important}.bar{height:48px;min-height:48px}.tip{display:none}}
  `;
  shadow.appendChild(style);

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Remote Camera v4.2");
  panel.innerHTML = `
    <div class="bar">
      <div class="brand">● Remote Camera <span style="font-weight:500;color:#aab6c8">v4.2</span></div>
      <button type="button" class="open" data-action="open" title="別タブで開く">別タブ</button>
      <button type="button" data-action="min" title="最小化">−</button>
      <button type="button" data-action="close" title="閉じる">×</button>
    </div>
    <div class="body">
      <iframe title="Remote Camera v4.2 Web" allow="camera; microphone; geolocation; autoplay; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      <div class="tip">閉じると接続も終了します。最小化は画面を隠してiframeを残します。</div>
    </div>`;
  shadow.appendChild(panel);

  const frame = shadow.querySelector("iframe");
  frame.src = APP_URL;

  const onFrameMessage = event => {
    if (event.source !== frame.contentWindow) return;
    if (!["https://cdn.jsdelivr.net", "https://a09848281-prog.github.io"].includes(event.origin)) return;
    const data = event.data;
    if (!data || data.channel !== "remote-camera-v42-bookmarklet") return;
    if (data.action === "expand-image") panel.classList.add("image-fullscreen");
    if (data.action === "restore-panel") panel.classList.remove("image-fullscreen");
  };
  window.addEventListener("message", onFrameMessage);

  shadow.querySelector('[data-action="open"]').addEventListener("click", () => {
    const tab = window.open(APP_URL, "_blank");
    if (!tab) alert("別タブを開けませんでした。ポップアップを許可するか、パネル内でご利用ください。");
  });

  shadow.querySelector('[data-action="min"]').addEventListener("click", event => {
    if (panel.classList.contains("image-fullscreen")) return;
    const minimized = panel.classList.toggle("min");
    event.currentTarget.textContent = minimized ? "□" : "−";
    event.currentTarget.title = minimized ? "元に戻す" : "最小化";
  });

  shadow.querySelector('[data-action="close"]').addEventListener("click", () => {
    window.removeEventListener("message", onFrameMessage);
    frame.src = "about:blank";
    host.remove();
  });

  const bar = shadow.querySelector(".bar");
  let drag = null;
  bar.addEventListener("pointerdown", event => {
    if (event.target.closest("button") || matchMedia("(max-width:640px)").matches) return;
    const rect = panel.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    bar.setPointerCapture(event.pointerId);
  });
  bar.addEventListener("pointermove", event => {
    if (!drag) return;
    const left = Math.max(0, Math.min(innerWidth - panel.offsetWidth, drag.left + event.clientX - drag.x));
    const top = Math.max(0, Math.min(innerHeight - 48, drag.top + event.clientY - drag.y));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });
  const stopDrag = () => { drag = null; };
  bar.addEventListener("pointerup", stopDrag);
  bar.addEventListener("pointercancel", stopDrag);
})();