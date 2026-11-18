package jp.a09848281.remotecamera

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume

class MonitorService : Service() {
    companion object {
        const val ACTION_START = "jp.a09848281.remotecamera.START"
        const val ACTION_REFRESH_CODE = "jp.a09848281.remotecamera.REFRESH_CODE"
        const val ACTION_STOP = "jp.a09848281.remotecamera.STOP"
        const val ACTION_UPDATE_LOCAL_SETTINGS = "jp.a09848281.remotecamera.UPDATE_LOCAL_SETTINGS"
        const val ACTION_CODE = "jp.a09848281.remotecamera.CODE"
        const val EXTRA_GAS_URL = "gas_url"
        const val EXTRA_WAIT_MODE = "wait_mode"
        const val EXTRA_REMOTE_CAPTURE_ENABLED = "remote_capture_enabled"
        const val EXTRA_KEEP_CPU_AWAKE = "keep_cpu_awake"
        const val EXTRA_CODE = "registration_code"
        const val EXTRA_DEVICE_ID = "device_id"
        private const val CHANNEL = "remote_camera_monitor"
        private const val NOTIFICATION_ID = 7301
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs by lazy { getSharedPreferences(AppConfig.PREFS, Context.MODE_PRIVATE) }
    private var gasUrl = ""
    private var api: ApiClient? = null
    private var rtc: RtcEngine? = null
    private var pollJob: Job? = null
    private var locationJob: Job? = null
    private var afterSeq = 0
    private var connectedLocationEnabled = false
    private var idleLocationEnabled = false
    private var connectedInterval = 30L
    private var idleInterval = 300L
    private var currentQuality = "720"
    private var currentDataMode = "standard"
    private var lastLocationAttempt = 0L
    private var lastCodeRefresh = 0L
    private val apiReady = CompletableDeferred<Unit>()
    private var cpuWakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Keep the foreground service and its notification while the user removes the UI task.
        super.onTaskRemoved(rootIntent)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val startIntent = intent
        if (startIntent == null) {
            val shouldRestore = prefs.getBoolean("monitoringEnabled", false)
            gasUrl = prefs.getString("gasUrl", "") ?: ""
            val cameraGranted = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            val micGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            if (!shouldRestore || !gasUrl.startsWith("https://script.google.com/") || !cameraGranted || !micGranted) {
                prefs.edit().putBoolean("monitoringEnabled", false).apply()
                stopSelf(startId)
                return START_NOT_STICKY
            }
            return try {
                startMonitoringForeground()
                if (pollJob?.isActive != true) pollJob = scope.launch { pollLoop() }
                if (locationJob?.isActive != true) locationJob = scope.launch { locationLoop() }
                START_STICKY
            } catch (e: Exception) {
                Log.e("RemoteCameraService", "Foreground service recovery failed", e)
                prefs.edit().putBoolean("monitoringEnabled", false).apply()
                stopSelf(startId)
                START_NOT_STICKY
            }
        }
        val action = startIntent.action
        if (action == ACTION_STOP) {
            stopMonitoringNow(startId)
            return START_NOT_STICKY
        }
        if (action == ACTION_UPDATE_LOCAL_SETTINGS) {
            if (pollJob?.isActive != true) {
                stopSelf(startId)
                return START_NOT_STICKY
            }
            val mode = startIntent.getStringExtra(EXTRA_WAIT_MODE) ?: "standard"
            val remoteEnabled = startIntent.getBooleanExtra(EXTRA_REMOTE_CAPTURE_ENABLED, true)
            val keepAwake = startIntent.getBooleanExtra(
                EXTRA_KEEP_CPU_AWAKE, prefs.getBoolean("keepCpuAwake", false)
            )
            prefs.edit()
                .putString("waitMode", if (mode in listOf("eco", "standard", "fast")) mode else "standard")
                .putBoolean("remoteCaptureEnabled", remoteEnabled)
                .putBoolean("keepCpuAwake", keepAwake)
                .apply()
            updateCpuWakeLock(keepAwake)
            if (!remoteEnabled) {
                rtc?.dispose()
                rtc = null
                notifyState("遠隔カメラ・マイクはスマホ設定でOFFです。待機通信は継続しています")
            } else {
                notifyState("遠隔カメラ・マイクの起動を許可しました。待機中は撮影・録音していません")
            }
            return START_STICKY
        }
        if (action != ACTION_START && action != ACTION_REFRESH_CODE) {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        gasUrl = startIntent.getStringExtra(EXTRA_GAS_URL)
            ?: prefs.getString("gasUrl", "")
            ?: ""
        if (!gasUrl.startsWith("https://script.google.com/")) {
            stopSelf()
            return START_NOT_STICKY
        }
        prefs.edit().putString("gasUrl", gasUrl).apply()
        startMonitoringForeground()

        if (pollJob?.isActive != true) pollJob = scope.launch { pollLoop() }
        if (locationJob?.isActive != true) locationJob = scope.launch { locationLoop() }

        if (action == ACTION_REFRESH_CODE) {
            scope.launch {
                try {
                    withTimeout(30000L) { apiReady.await() }
                    refreshCode()
                } catch (e: Exception) {
                    notifyState("ペアリングコード再発行失敗：" + (e.message ?: "通信エラー"))
                }
            }
        }
        return START_STICKY
    }

    private fun startMonitoringForeground() {
        createChannel()
        prefs.edit().putBoolean("monitoringEnabled", true).apply()
        val notification = notification("待機中：撮影・録音なし／Web要求を確認しています")
        if (Build.VERSION.SDK_INT >= 29) {
            var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            val locationGranted =
                checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (locationGranted) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            startForeground(NOTIFICATION_ID, notification, types)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        updateCpuWakeLock(prefs.getBoolean("keepCpuAwake", false))
    }

    private fun updateCpuWakeLock(enabled: Boolean) {
        if (!enabled) {
            try {
                cpuWakeLock?.let { if (it.isHeld) it.release() }
            } catch (e: Exception) {
                Log.w("RemoteCameraService", "Could not release CPU wake lock", e)
            } finally {
                cpuWakeLock = null
            }
            return
        }
        if (cpuWakeLock?.isHeld == true) return
        try {
            val power = getSystemService(Context.POWER_SERVICE) as PowerManager
            cpuWakeLock = power.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "$packageName:RemoteCameraStandby"
            ).apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (e: Exception) {
            Log.e("RemoteCameraService", "Could not acquire CPU wake lock", e)
            notifyState("安定待機用のCPU維持を開始できませんでした。通常待機で継続します")
        }
    }

    private fun releaseCpuWakeLock() {
        updateCpuWakeLock(false)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Remote Camera", NotificationManager.IMPORTANCE_LOW)
                    .apply { description = "遠隔監視の待機・接続状態を表示します。" }
            )
        }
    }

    private fun stopActionPendingIntent(): PendingIntent {
        val intent = Intent(this, MonitorService::class.java).setAction(ACTION_STOP)
        return PendingIntent.getService(
            this, 2, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun notification(text: String): Notification {
        val pending = PendingIntent.getActivity(
            this, 1, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("Remote Camera")
            .setContentText(text)
            .setContentIntent(pending)
            .addAction(android.R.drawable.ic_media_pause, "待機を停止", stopActionPendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun stopMonitoringNow(startId: Int) {
        pollJob?.cancel()
        pollJob = null
        locationJob?.cancel()
        locationJob = null
        rtc?.dispose()
        rtc = null
        prefs.edit().putBoolean("monitoringEnabled", false).apply()
        releaseCpuWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
        stopSelf(startId)
    }

    private fun notifyState(text: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(text))
    }

    private suspend fun pollLoop() {
        try {
            api = ApiClient(gasUrl)
            ensureDevice()
            if (!apiReady.isCompleted) apiReady.complete(Unit)
            while (scope.isActive) {
                try {
                    val deviceId = prefs.getString("deviceId", "") ?: ""
                    val secret = prefs.getString("deviceSecret", "") ?: ""
                    val response = api!!.call(
                        "device_poll",
                        JSONObject().put("deviceId", deviceId).put("deviceSecret", secret).put("afterSeq", afterSeq)
                    )
                    if (!response.optBoolean("registered", false)) {
                        prefs.edit().putBoolean("serverPaired", false).apply()
                        // A controller can revoke pairing remotely. Stop media immediately on the next poll.
                        rtc?.dispose()
                        rtc = null
                        val pairingCodeActive = response.optBoolean("pairingCodeActive", false)
                        if (!pairingCodeActive || System.currentTimeMillis() - lastCodeRefresh > 8 * 60 * 1000L) {
                            refreshCode()
                        }
                        notifyState("Android端末の登録待ち：Webに8桁コードを入力")
                    } else {
                        val needsPairing = response.optBoolean("needsPairing", false)
                        prefs.edit().putBoolean("serverPaired", !needsPairing).apply()
                        val codeActive = response.optBoolean("pairingCodeActive", false)
                        if (needsPairing) {
                            if (System.currentTimeMillis() - lastCodeRefresh > 8 * 60 * 1000L) {
                                refreshCode()
                            }
                        } else if (!codeActive && (prefs.getString("registrationCode", "") ?: "").isNotBlank()) {
                            prefs.edit().remove("registrationCode").apply()
                            broadcastCode("", deviceId)
                        }
                        applySettings(response.optJSONObject("settings") ?: JSONObject())
                        val signals = response.optJSONArray("signals") ?: JSONArray()
                        for (i in 0 until signals.length()) {
                            val signal = signals.optJSONObject(i) ?: continue
                            when (signal.optString("kind")) {
                                "offer" -> {
                                    if (signal.optString("sdp").isBlank()) continue
                                    val session = signal.optString("sessionId")
                                    try {
                                        val cameraGranted = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                                        val micGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                                        if (!cameraGranted || !micGranted) {
                                            notifyState("接続できません：カメラ・マイクの権限を確認してください")
                                            continue
                                        }
                                        if (!prefs.getBoolean("remoteCaptureEnabled", true)) {
                                            notifyState("接続要求を拒否しました：スマホ側で遠隔カメラ・マイクがOFFです")
                                            try {
                                                api?.call("send_signal", JSONObject()
                                                    .put("deviceId", deviceId).put("deviceSecret", secret)
                                                    .put("sessionId", session).put("recipient", "viewer")
                                                    .put("kind", "error").put("sdp", "スマホ側で遠隔カメラ・マイクが無効です"))
                                            } catch (e: Exception) {
                                                Log.w("RemoteCameraService", "Could not report disabled remote media", e)
                                            }
                                            continue
                                        }
                                        if (rtc == null) {
                                            val currentApi = api ?: continue
                                            rtc = RtcEngine(this, currentApi, deviceId, secret, scope, ::notifyState)
                                        }
                                        // Apply the selected profile before creating Camera2 and the first peer.
                                        // The sender bitrate/FPS are applied inside handleOffer after tracks are added.
                                        rtc?.setQuality(currentQuality, currentDataMode)
                                        rtc?.handleOffer(session, signal.optString("sdp"))
                                        notifyState("Web接続中：カメラ・マイクを使用しています")
                                    } catch (e: Exception) {
                                        Log.e("RemoteCameraService", "Offer handling failed; keep foreground service alive", e)
                                        notifyState("接続開始に失敗しました：" + (e.message ?: "詳細不明") + "。待機は継続します")
                                    }
                                }
                                "bye" -> {
                                    rtc?.closeSession(signal.optString("sessionId"))
                                    notifyState("Web側から切断要求を受信しました")
                                }
                            }
                        }
                        val commands = response.optJSONArray("commands") ?: JSONArray()
                        for (i in 0 until commands.length()) processCommand(commands.optJSONObject(i) ?: continue)
                        // Advance only after this poll's signals and commands have been handed to the handlers.
                        afterSeq = maxOf(afterSeq, response.optInt("latestSeq", afterSeq))
                        prefs.edit().putInt("afterSeq", afterSeq).apply()
                        notifyState(if (rtc?.hasPeers() == true) "監視中・接続済み" else "監視待機中")
                    }
                } catch (e: Exception) {
                    Log.e("RemoteCameraService", "Polling iteration failed; foreground service remains active", e)
                    notifyState("通信または接続処理に失敗しました。待機を継続して再試行します")
                }
                val waitSeconds = when (prefs.getString("waitMode", "standard")) {
                    "eco" -> 60L
                    "fast" -> 5L
                    else -> 15L
                }
                delay(waitSeconds * 1000L)
            }
        } catch (e: Exception) {
            if (!apiReady.isCompleted) apiReady.completeExceptionally(e)
            notifyState("待機サービスを開始できませんでした")
        }
    }

    private suspend fun ensureDevice() {
        var id = prefs.getString("deviceId", "") ?: ""
        var secret = prefs.getString("deviceSecret", "") ?: ""
        if (id.isBlank() || secret.isBlank()) {
            id = UUID.randomUUID().toString()
            val response = api!!.call("device_begin", JSONObject().put("deviceId", id).put("deviceName", Build.MODEL ?: "Android"))
            secret = response.getString("deviceSecret")
            prefs.edit().putString("deviceId", id).putString("deviceSecret", secret)
                .putBoolean("serverPaired", false).putInt("afterSeq", 0).apply()
            afterSeq = 0
            showPairingCode(response.optString("registrationCode"), id)
        } else {
            afterSeq = prefs.getInt("afterSeq", 0)
            val saved = prefs.getString("registrationCode", "") ?: ""
            if (saved.isNotBlank()) broadcastCode(saved, id)
        }
    }

    private suspend fun refreshCode() {
        val response = api!!.call(
            "device_refresh_code",
            JSONObject().put("deviceId", prefs.getString("deviceId", ""))
                .put("deviceSecret", prefs.getString("deviceSecret", ""))
        )
        showPairingCode(response.optString("registrationCode"), prefs.getString("deviceId", "") ?: "")
    }

    private fun showPairingCode(code: String, id: String) {
        lastCodeRefresh = System.currentTimeMillis()
        prefs.edit().putString("registrationCode", code).putLong("codeRefreshedAt", lastCodeRefresh).apply()
        broadcastCode(code, id)
        notifyState("端末登録待ち：8桁コードをWebへ入力")
    }

    private fun broadcastCode(code: String, id: String) {
        sendBroadcast(
            Intent(ACTION_CODE).setPackage(packageName)
                .putExtra(EXTRA_CODE, code).putExtra(EXTRA_DEVICE_ID, id)
        )
    }

    private fun applySettings(settings: JSONObject) {
        connectedLocationEnabled = settings.optBoolean("connectedLocationEnabled", false)
        idleLocationEnabled = settings.optBoolean("idleLocationEnabled", false)
        connectedInterval = settings.optLong("connectedInterval", 30).coerceIn(10, 3600)
        idleInterval = settings.optLong("idleInterval", 300).coerceIn(10, 3600)
        currentQuality = settings.optString("quality", "720")
        currentDataMode = settings.optString("dataMode", "standard")
        rtc?.setQuality(currentQuality, currentDataMode)
    }

    private suspend fun processCommand(command: JSONObject) {
        val name = command.optString("command")
        val commandId = command.optString("commandId")
        val payload = command.optJSONObject("payload") ?: JSONObject()
        var succeeded = true
        try {
            when (name) {
                "location_once" -> requestLocation("manual")
                "location_settings" -> {
                    applySettings(payload)
                    prefs.edit().putBoolean("connectedLocationEnabled", connectedLocationEnabled)
                        .putBoolean("idleLocationEnabled", idleLocationEnabled)
                        .putLong("connectedInterval", connectedInterval)
                        .putLong("idleInterval", idleInterval).apply()
                }
                "camera" -> (rtc ?: error("映像接続中ではありません。")).switchCamera(payload.optString("facing", "back"))
                "volume" -> {
                    val percent = payload.optInt("percent", 70).coerceIn(0, 100)
                    val audio = getSystemService(AUDIO_SERVICE) as AudioManager
                    val stream = AudioManager.STREAM_VOICE_CALL
                    val max = audio.getStreamMaxVolume(stream)
                    audio.setStreamVolume(stream, (max * percent / 100.0).toInt(), 0)
                }
                "quality", "data_mode" -> {
                    currentQuality = payload.optString("quality", currentQuality)
                    currentDataMode = payload.optString("dataMode", currentDataMode)
                    rtc?.setQuality(currentQuality, currentDataMode)
                }
                "disconnect" -> {
                    rtc?.dispose()
                    rtc = null
                    notifyState("監視待機中")
                }
            }
        } catch (e: Exception) {
            succeeded = false
            notifyState("命令実行失敗：" + (e.message ?: name))
        }
        if (commandId.isNotBlank()) {
            try {
                api?.call("ack_command", JSONObject()
                    .put("deviceId", prefs.getString("deviceId", ""))
                    .put("deviceSecret", prefs.getString("deviceSecret", ""))
                    .put("commandId", commandId)
                    .put("success", succeeded))
            } catch (_: Exception) {
                notifyState("命令の結果をGASへ送信できませんでした")
            }
        }
    }

    private suspend fun locationLoop() {
        while (scope.isActive) {
            try {
                val connected = rtc?.hasPeers() == true
                val enabled = if (connected) connectedLocationEnabled else idleLocationEnabled
                val interval = (if (connected) connectedInterval else idleInterval) * 1000L
                if (enabled && System.currentTimeMillis() - lastLocationAttempt >= interval) {
                    requestLocation(if (connected) "connected" else "background")
                }
            } catch (_: Exception) {}
            delay(5000)
        }
    }

    private suspend fun requestLocation(mode: String) {
        val fineGranted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarseGranted = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fineGranted && !coarseGranted) {
            notifyState("位置情報の権限がありません。Android設定で許可してください")
            return
        }

        val manager = getSystemService(LOCATION_SERVICE) as LocationManager
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { provider -> try { manager.isProviderEnabled(provider) } catch (_: Exception) { false } }
        if (providers.isEmpty()) {
            notifyState("位置情報サービスがOFFです。Androidの位置情報をONにしてください")
            return
        }

        lastLocationAttempt = System.currentTimeMillis()
        notifyState("位置情報を取得中（GPS・ネットワークを確認）")
        try {
            val now = System.currentTimeMillis()
            val cached = providers.mapNotNull { provider ->
                try { manager.getLastKnownLocation(provider) } catch (_: SecurityException) { null }
            }.filter { location ->
                val age = now - location.time
                age in 0..120000L
            }.minByOrNull { it.accuracy }

            val fresh = acquireBestLocation(manager, providers)
            val selected = fresh ?: cached
            if (selected != null) {
                saveLocation(selected, mode)
            } else {
                notifyState("位置情報を取得できません。位置情報ON・屋外・権限（正確な位置情報）を確認してください")
            }
        } catch (e: SecurityException) {
            notifyState("位置情報の権限が不足しています。正確な位置情報を許可してください")
        } catch (e: Exception) {
            Log.e("RemoteCameraService", "Location request failed", e)
            notifyState("位置情報取得失敗：" + (e.message ?: "設定・権限を確認してください"))
        }
    }

    /**
     * Listen to GPS and network providers together. Keep the most accurate fix,
     * finish early for a good fix, and always unregister the listener.
     */
    private suspend fun acquireBestLocation(
        manager: LocationManager,
        providers: List<String>
    ): Location? {
        var activeListener: LocationListener? = null
        val handler = Handler(Looper.getMainLooper())
        var finishRunnable: Runnable? = null
        val best = AtomicReference<Location?>(null)
        return try {
            withTimeoutOrNull(18000L) {
                suspendCancellableCoroutine { continuation ->
                    val listener = object : LocationListener {
                        override fun onLocationChanged(location: Location) {
                            val previous = best.get()
                            if (previous == null || location.accuracy < previous.accuracy ||
                                (location.accuracy == previous.accuracy && location.time > previous.time)) {
                                best.set(location)
                            }
                            if (location.accuracy <= 35f && continuation.isActive) {
                                finishRunnable?.let { handler.removeCallbacks(it) }
                                continuation.resume(best.get())
                            }
                        }
                        override fun onProviderEnabled(provider: String) {}
                        override fun onProviderDisabled(provider: String) {}
                    }
                    activeListener = listener
                    finishRunnable = Runnable {
                        if (continuation.isActive) continuation.resume(best.get())
                    }
                    var registered = false
                    providers.forEach { provider ->
                        try {
                            manager.requestLocationUpdates(
                                provider, 1000L, 0f, listener, Looper.getMainLooper()
                            )
                            registered = true
                        } catch (e: SecurityException) {
                            Log.w("RemoteCameraService", "Location permission denied for " + provider, e)
                        } catch (e: Exception) {
                            Log.w("RemoteCameraService", "Could not start provider " + provider, e)
                        }
                    }
                    handler.postDelayed(finishRunnable!!, 12000L)
                    if (!registered && continuation.isActive) {
                        handler.removeCallbacks(finishRunnable!!)
                        continuation.resume(null)
                    }
                    continuation.invokeOnCancellation {
                        finishRunnable?.let { handler.removeCallbacks(it) }
                    }
                }
            }
        } finally {
            try { activeListener?.let { manager.removeUpdates(it) } } catch (_: Exception) {}
            finishRunnable?.let { handler.removeCallbacks(it) }
        }
    }

    private suspend fun saveLocation(location: Location, mode: String) {
        try {
            api?.call("add_location", JSONObject()
                .put("deviceId", prefs.getString("deviceId", ""))
                .put("deviceSecret", prefs.getString("deviceSecret", ""))
                .put("lat", location.latitude).put("lng", location.longitude)
                .put("accuracy", location.accuracy.toDouble()).put("timestamp", location.time)
                .put("mode", mode))
            lastLocationAttempt = System.currentTimeMillis()
            notifyState("位置情報を保存しました")
        } catch (_: Exception) {
            notifyState("位置情報送信失敗")
        }
    }

    override fun onDestroy() {
        pollJob?.cancel()
        locationJob?.cancel()
        rtc?.dispose()
        rtc = null
        releaseCpuWakeLock()
        prefs.edit().putBoolean("monitoringEnabled", false).apply()
        scope.cancel()
        super.onDestroy()
    }
}