package jp.a09848281.remotecamera

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var status: TextView
    private lateinit var codeView: TextView
    private lateinit var startButton: Button
    private lateinit var refreshCodeButton: Button
    private lateinit var stopButton: Button
    private lateinit var waitModeSpinner: Spinner
    private lateinit var remoteCaptureSwitch: Switch
    private lateinit var keepAwakeSwitch: Switch
    private var selectedWaitMode = "standard"
    private val waitModeKeys = listOf("eco", "standard", "fast")
    private val waitModeLabels = listOf("省電力：30秒ごとに確認", "標準：6秒ごとに確認", "応答優先：2秒ごとに確認")
    private var gasUrl = ""
    private val prefs by lazy { getSharedPreferences(AppConfig.PREFS, MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(28, 40, 28, 28)
            setBackgroundColor(0xFFF2F5FA.toInt())
        }
        root.addView(TextView(this).apply {
            text = "Remote Camera"
            textSize = 28f
            setTextColor(0xFF17243A.toInt())
        })
        status = TextView(this).apply {
            text = "設定を読み込んでいます…"
            textSize = 15f
            setTextColor(0xFF586980.toInt())
            setPadding(0, 26, 0, 16)
        }
        codeView = TextView(this).apply {
            text = "登録コード：--"
            textSize = 22f
            setTextColor(0xFF2862C8.toInt())
            setPadding(0, 12, 0, 24)
        }

        refreshCodeButton = Button(this).apply {
            text = "ペアリングコードを再発行"
            isEnabled = false
            setOnClickListener { requestRefreshCode() }
        }
        startButton = Button(this).apply {
            text = "監視待機を開始"
            isEnabled = false
            setOnClickListener { requestStart() }
        }
        stopButton = Button(this).apply {
            text = "監視待機を停止"
            isEnabled = false
            setOnClickListener { stopMonitoring() }
        }

        selectedWaitMode = prefs.getString("waitMode", "standard") ?: "standard"
        if (selectedWaitMode !in waitModeKeys) selectedWaitMode = "standard"

        remoteCaptureSwitch = Switch(this).apply {
            text = "Webからカメラ・マイクの起動を許可"
            isChecked = prefs.getBoolean("remoteCaptureEnabled", true)
            setOnCheckedChangeListener { _, enabled ->
                prefs.edit().putBoolean("remoteCaptureEnabled", enabled).apply()
                applyLocalSettingsToService()
            }
        }

        keepAwakeSwitch = Switch(this).apply {
            text = "画面OFF中も通信を維持（安定優先・電池消費増）"
            isChecked = prefs.getBoolean("keepCpuAwake", false)
            setOnCheckedChangeListener { _, enabled ->
                prefs.edit().putBoolean("keepCpuAwake", enabled).apply()
                applyLocalSettingsToService()
            }
        }

        waitModeSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(
                this@MainActivity,
                android.R.layout.simple_spinner_item,
                waitModeLabels
            ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
            setSelection(waitModeKeys.indexOf(selectedWaitMode).coerceAtLeast(0))
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: android.view.View?, position: Int, id: Long) {
                    val mode = waitModeKeys.getOrElse(position) { "standard" }
                    if (mode != selectedWaitMode) {
                        selectedWaitMode = mode
                        prefs.edit().putString("waitMode", mode).apply()
                        applyLocalSettingsToService()
                    }
                }
                override fun onNothingSelected(parent: AdapterView<*>?) {}
            }
        }

        root.addView(status)
        root.addView(codeView)
        root.addView(TextView(this).apply {
            text = "スマホ側のバックグラウンド設定"
            textSize = 18f
            setTextColor(0xFF17243A.toInt())
            setPadding(0, 18, 0, 6)
        })
        root.addView(remoteCaptureSwitch)
        root.addView(keepAwakeSwitch)
        root.addView(TextView(this).apply {
            text = "Webからの接続要求を確認する間隔"
            textSize = 14f
            setTextColor(0xFF586980.toInt())
            setPadding(0, 10, 0, 4)
        })
        root.addView(waitModeSpinner, LinearLayout.LayoutParams(-1, -2))
        root.addView(refreshCodeButton, LinearLayout.LayoutParams(-1, -2))
        root.addView(startButton, LinearLayout.LayoutParams(-1, -2))
        root.addView(stopButton, LinearLayout.LayoutParams(-1, -2))
        root.addView(TextView(this).apply {
            text = "アプリ画面で監視待機を開始すると、常時通知を表示してWebからの接続要求を待ち受けます。待機中は撮影・録音しません。カメラ・マイクの権限は必須、位置情報は任意です。位置情報を使う場合は正確な位置情報を許可してください。Webからの起動を許可した場合、開始済みの待機サービスが動作している間は画面ロック後も接続を試みます。撮影・録音中はAndroidのプライバシー表示と通知に状態が出ます。強制停止・端末再起動・権限取消・省電力制御後の動作は保証されません。"
            textSize = 13f
            setTextColor(0xFF66758B.toInt())
            setPadding(0, 22, 0, 0)
        })
        setContentView(root)
        loadRemoteConfig()
    }

    private fun loadRemoteConfig() {
        scope.launch {
            try {
                gasUrl = withContext(Dispatchers.IO) {
                    val c = URL(AppConfig.REMOTE_CONFIG_URL).openConnection() as HttpURLConnection
                    c.connectTimeout = 12000
                    c.readTimeout = 12000
                    try {
                        JSONObject(c.inputStream.bufferedReader().use { it.readText() }).optString("gasUrl", "")
                    } finally { c.disconnect() }
                }
                if (gasUrl.isBlank() || gasUrl.contains("PASTE_YOUR_DEPLOYMENT_ID")) {
                    status.text = "GitHubの web/config.json にGAS URLを設定してください。"
                } else {
                    status.text = "設定を取得しました。必要な権限を許可して待機を開始できます。"
                    refreshMonitoringButtons()
                    refreshCodeButton.isEnabled = true
                    showSavedCode()
                }
            } catch (e: Exception) {
                status.text = "設定取得エラー：" + (e.message ?: "通信エラー")
            }
        }
    }

    private fun requestStart() {
        selectedWaitMode = waitModeKeys.getOrElse(waitModeSpinner.selectedItemPosition) { "standard" }
        prefs.edit()
            .putString("waitMode", selectedWaitMode)
            .putBoolean("remoteCaptureEnabled", remoteCaptureSwitch.isChecked)
            .putBoolean("keepCpuAwake", keepAwakeSwitch.isChecked)
            .apply()
        val requested = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= 33) requested.add(Manifest.permission.POST_NOTIFICATIONS)
        val missing = requested.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 310)
        else startMonitoring()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 310) {
            val cameraOk = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            val micOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            val locationOk = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (cameraOk && micOk) {
                if (!locationOk) {
                    Toast.makeText(this, "カメラ待機を開始します。位置情報は無効です。位置情報を使う場合はアプリの権限設定で許可してください。", Toast.LENGTH_LONG).show()
                }
                startMonitoring()
            } else {
                Toast.makeText(this, "カメラとマイクの権限が必要です。位置情報の権限は任意です。", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun refreshMonitoringButtons() {
        val running = prefs.getBoolean("monitoringEnabled", false)
        startButton.isEnabled = gasUrl.isNotBlank() && !running
        stopButton.isEnabled = running
    }

    private fun startMonitoring() {
        val intent = Intent(this, MonitorService::class.java).apply {
            action = MonitorService.ACTION_START
            putExtra(MonitorService.EXTRA_GAS_URL, gasUrl)
        }
        try {
            ContextCompat.startForegroundService(this, intent)
            prefs.edit().putBoolean("monitoringEnabled", true).apply()
            status.text = "監視待機を開始しました（${waitModeDescription()}）。通知欄からも停止できます。"
            refreshMonitoringButtons()
        } catch (e: Exception) {
            prefs.edit().putBoolean("monitoringEnabled", false).apply()
            status.text = "待機開始エラー：" + (e.message ?: "開始できませんでした")
            refreshMonitoringButtons()
        }
    }

    private fun waitModeDescription(): String = when (selectedWaitMode) {
        "eco" -> "省電力・30秒間隔"
        "fast" -> "応答優先・2秒間隔"
        else -> "標準・6秒間隔"
    }

    private fun applyLocalSettingsToService() {
        if (!prefs.getBoolean("monitoringEnabled", false)) return
        val intent = Intent(this, MonitorService::class.java).apply {
            action = MonitorService.ACTION_UPDATE_LOCAL_SETTINGS
            putExtra(MonitorService.EXTRA_WAIT_MODE, selectedWaitMode)
            putExtra(MonitorService.EXTRA_REMOTE_CAPTURE_ENABLED, remoteCaptureSwitch.isChecked)
            putExtra(MonitorService.EXTRA_KEEP_CPU_AWAKE, keepAwakeSwitch.isChecked)
        }
        try {
            startService(intent)
        } catch (e: Exception) {
            status.text = "設定反映エラー：" + (e.message ?: "サービスへ反映できませんでした")
        }
    }

    private fun requestRefreshCode() {
        if (gasUrl.isBlank()) {
            Toast.makeText(this, "GAS設定を読み込めていません。", Toast.LENGTH_LONG).show()
            return
        }
        val savedDeviceId = prefs.getString("deviceId", "") ?: ""
        val savedDeviceSecret = prefs.getString("deviceSecret", "") ?: ""
        if (savedDeviceId.isBlank() || savedDeviceSecret.isBlank()) {
            Toast.makeText(this, "先に「監視待機を開始」を押して端末を初期登録してください。", Toast.LENGTH_LONG).show()
            return
        }
        val cameraOk = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val micOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val locationOk = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!cameraOk || !micOk) {
            Toast.makeText(this, "カメラとマイクの権限を許可してから操作してください。位置情報は任意です。", Toast.LENGTH_LONG).show()
            requestStart()
            return
        }
        val intent = Intent(this, MonitorService::class.java).apply {
            action = MonitorService.ACTION_REFRESH_CODE
            putExtra(MonitorService.EXTRA_GAS_URL, gasUrl)
        }
        try {
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "ペアリングコードを再発行しています。", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "再発行できません：" + (e.message ?: "エラー"), Toast.LENGTH_LONG).show()
        }
    }

    private fun stopMonitoring() {
        stopService(Intent(this, MonitorService::class.java))
        prefs.edit().putBoolean("monitoringEnabled", false).apply()
        status.text = "監視待機を停止しました。バックグラウンド通信も停止しました。"
        refreshMonitoringButtons()
    }

    private fun showSavedCode() {
        val code = prefs.getString("registrationCode", "") ?: ""
        val id = prefs.getString("deviceId", "") ?: ""
        codeView.text = when {
            id.isBlank() -> "登録コード：--"
            code.isNotBlank() -> "登録コード：$code\n端末ID：$id"
            prefs.getBoolean("serverPaired", false) ->
                "GASでペアリング確認済み\n端末ID：$id"
            else -> "端末情報あり・GAS確認待ち\n端末ID：$id"
        }
    }

    override fun onResume() {
        super.onResume()
        val filter = android.content.IntentFilter(MonitorService.ACTION_CODE)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(codeReceiver, filter, RECEIVER_NOT_EXPORTED)
        else @Suppress("DEPRECATION") registerReceiver(codeReceiver, filter)
        showSavedCode()
        refreshMonitoringButtons()
    }

    override fun onPause() {
        try { unregisterReceiver(codeReceiver) } catch (_: Exception) {}
        super.onPause()
    }

    private val codeReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context?, intent: Intent?) {
            val code = intent?.getStringExtra(MonitorService.EXTRA_CODE) ?: return
            val id = intent.getStringExtra(MonitorService.EXTRA_DEVICE_ID) ?: ""
            if (code.isNotBlank()) {
                codeView.text = "登録コード：$code\n端末ID：$id"
            } else {
                showSavedCode()
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}