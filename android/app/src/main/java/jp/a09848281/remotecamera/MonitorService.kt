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
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class MonitorService : Service() {
    companion object {
        const val ACTION_START = "jp.a09848281.remotecamera.START"
        const val ACTION_REFRESH_CODE = "jp.a09848281.remotecamera.REFRESH_CODE"
        const val ACTION_CODE = "jp.a09848281.remotecamera.CODE"
        const val EXTRA_GAS_URL = "gas_url"
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

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val startIntent = intent
        if (startIntent == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val action = startIntent.action
        if (action != ACTION_START && action != ACTION_REFRESH_CODE) {
            stopSelf()
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
        return START_NOT_STICKY
    }

    private fun startMonitoringForeground() {
        createChannel()
        val notification = notification("監視待機中（接続要求を確認しています）")
        if (Build.VERSION.SDK_INT >= 29) {
            val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            startForeground(NOTIFICATION_ID, notification, types)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Remote Camera", NotificationManager.IMPORTANCE_LOW)
                    .apply { description = "遠隔監視の待機・接続状態を表示します。" }
            )
        }
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
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
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
                        if (System.currentTimeMillis() - lastCodeRefresh > 8 * 60 * 1000L) refreshCode()
                        notifyState("Android端末の登録待ち：Webに8桁コードを入力")
                    } else {
                        val needsPairing = response.optBoolean("needsPairing", false)
                        val codeActive = response.optBoolean("pairingCodeActive", false)
                        if (needsPairing) {
                            if (System.currentTimeMillis() - lastCodeRefresh > 8 * 60 * 1000L) {
                                refreshCode()
                            }
                        } else if (!codeActive && (prefs.getString("registrationCode", "") ?: "").isNotBlank()) {
                            prefs.edit().remove("registrationCode").apply()
                            broadcastCode("", deviceId)
                        }
                        afterSeq = maxOf(afterSeq, response.optInt("latestSeq", afterSeq))
                        prefs.edit().putInt("afterSeq", afterSeq).apply()
                        applySettings(response.optJSONObject("settings") ?: JSONObject())
                        val signals = response.optJSONArray("signals") ?: JSONArray()
                        for (i in 0 until signals.length()) {
                            val signal = signals.optJSONObject(i) ?: continue
                            if (signal.optString("kind") == "offer" && signal.optString("sdp").isNotBlank()) {
                                val session = signal.optString("sessionId")
                                if (rtc == null) {
                                    val currentApi = api ?: continue
                                    rtc = RtcEngine(this, currentApi, deviceId, secret, scope, ::notifyState)
                                }
                                rtc?.handleOffer(session, signal.optString("sdp"))
                                // Apply saved quality after handleOffer creates the RTP video sender.
                                rtc?.setQuality(currentQuality, currentDataMode)
                                notifyState("接続要求を受信しました")
                            }
                        }
                        val commands = response.optJSONArray("commands") ?: JSONArray()
                        for (i in 0 until commands.length()) processCommand(commands.optJSONObject(i) ?: continue)
                        notifyState(if (rtc?.hasPeers() == true) "監視中・接続済み" else "監視待機中")
                    }
                } catch (e: Exception) {
                    notifyState("GAS通信エラー：再試行します")
                }
                delay(AppConfig.POLL_SECONDS * 1000L)
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
                .putInt("afterSeq", 0).apply()
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
                "camera" -> rtc?.switchCamera(payload.optString("facing", "back"))
                "volume" -> {
                    val percent = payload.optInt("percent", 70).coerceIn(0, 100)
                    val audio = getSystemService(AUDIO_SERVICE) as AudioManager
                    val stream = AudioManager.STREAM_VOICE_CALL
                    val max = audio.getStreamMaxVolume(stream)
                    audio.setStreamVolume(stream, (max * percent / 100.0).toInt(), 0)
                }
                "quality", "data_mode" -> rtc?.setQuality(
                    payload.optString("quality", "720"),
                    payload.optString("dataMode", "standard")
                )
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
        val granted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notifyState("位置情報の権限がありません")
            return
        }
        val manager = getSystemService(LOCATION_SERVICE) as LocationManager
        val provider = when {
            manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> {
                notifyState("GPS・ネットワーク位置情報が無効です")
                return
            }
        }
        lastLocationAttempt = System.currentTimeMillis()
        val cached = try { manager.getLastKnownLocation(provider) } catch (_: SecurityException) { null }
        if (cached != null && System.currentTimeMillis() - cached.time < 120000L) {
            saveLocation(cached, mode)
            return
        }
        try {
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    scope.launch { saveLocation(location, mode) }
                    try { manager.removeUpdates(this) } catch (_: Exception) {}
                }
            }
            manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
            notifyState("位置情報を取得中")
        } catch (e: Exception) {
            notifyState("位置情報取得失敗：設定・権限を確認")
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
        scope.cancel()
        super.onDestroy()
    }
}