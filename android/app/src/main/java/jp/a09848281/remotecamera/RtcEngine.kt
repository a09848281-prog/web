package jp.a09848281.remotecamera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.content.Intent
import android.content.IntentFilter
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.BatteryManager
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import org.json.JSONObject
import org.webrtc.*
import org.webrtc.audio.AudioDeviceModule
import org.webrtc.audio.JavaAudioDeviceModule
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.atan

class RtcEngine(
    private val context: Context,
    private val api: ApiClient,
    private val deviceId: String,
    private val secret: String,
    private val audioPickupMode: String,
    private val scope: CoroutineScope,
    private val onState: (String) -> Unit,
    private val onControlCommand: (JSONObject) -> Unit = {}
) {
    private val peers = ConcurrentHashMap<String, PeerConnection>()
    private val videoSenders = ConcurrentHashMap<String, RtpSender>()
    private val dataChannels = ConcurrentHashMap<String, DataChannel>()
    private val iceStates = ConcurrentHashMap<String, PeerConnection.IceConnectionState>()
    private val disconnectTimers = ConcurrentHashMap<String, Job>()
    private var factory: PeerConnectionFactory? = null
    private var audioDeviceModule: AudioDeviceModule? = null
    private var egl: EglBase? = null
    private var currentCameraId: String? = null
    private var flashlightEnabled = false
    private var audioModeChanged = false
    private var previousAudioMode = AudioManager.MODE_NORMAL
    private var currentCaptureRatio = "16:9"
    private var currentFpsLimit = 24
    private var capturer: CameraVideoCapturer? = null
    private var helper: SurfaceTextureHelper? = null
    private var videoSource: VideoSource? = null
    private var audioSource: AudioSource? = null
    private var videoTrack: VideoTrack? = null
    private var audioTrack: AudioTrack? = null
    private var frontCamera = false
    private var currentQuality = "720"
    private var currentDataMode = "standard"
    private var captureWidth = 1280
    private var captureHeight = 720
    private var captureFps = 24
    private val cameraRecoveryScheduled = AtomicBoolean(false)
    private var deferredFormatMessageFor: String? = null

    private data class VideoProfile(
        val width: Int, val height: Int, val fps: Int, val bitrate: Int
    )

    private fun profileFor(
        quality: String,
        dataMode: String,
        ratio: String = currentCaptureRatio,
        fpsLimit: Int = currentFpsLimit
    ): VideoProfile {
        val tier = when (quality) { "360" -> 360; "480" -> 480; "1080" -> 1080; else -> 720 }
        val dimensions = when (ratio) {
            "4:3" -> when (tier) {
                360 -> 640 to 480
                480 -> 854 to 640
                1080 -> 1440 to 1080
                else -> 1280 to 960
            }
            "1:1" -> when (tier) {
                360 -> 360 to 360
                480 -> 480 to 480
                1080 -> 1080 to 1080
                else -> 720 to 720
            }
            "9:16" -> when (tier) {
                360 -> 360 to 640
                480 -> 480 to 854
                1080 -> 1080 to 1920
                else -> 720 to 1280
            }
            else -> when (tier) {
                360 -> 640 to 360
                480 -> 854 to 480
                1080 -> 1920 to 1080
                else -> 1280 to 720
            }
        }
        val baseFps = fpsLimit.coerceIn(15, 30)
        val baseBitrate = when (tier) {
            360 -> 650000
            480 -> 1000000
            1080 -> 3200000
            else -> 1700000
        }
        val base = VideoProfile(dimensions.first, dimensions.second, baseFps, baseBitrate)
        return when (dataMode) {
            "ultra" -> base.copy(fps = minOf(baseFps, 10), bitrate = 350000)
            "save" -> base.copy(fps = minOf(baseFps, 15), bitrate = 650000)
            "auto" -> base.copy(fps = minOf(baseFps, 20), bitrate = minOf(baseBitrate, 1200000))
            "high" -> base.copy(fps = baseFps, bitrate = minOf(3500000, (baseBitrate * 1.25).toInt()))
            else -> base
        }
    }

    private fun fallbackDimensions(ratio: String): List<Pair<Int, Int>> = when (ratio) {
        "4:3" -> listOf(960 to 720, 640 to 480)
        "1:1" -> listOf(720 to 720, 480 to 480)
        "9:16" -> listOf(720 to 1280, 480 to 854, 360 to 640)
        else -> listOf(960 to 540, 640 to 360)
    }

    private fun enterCommunicationAudioMode() {
        val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (!audioModeChanged) {
            previousAudioMode = manager.mode
            audioModeChanged = true
        }
        // Ambient/balanced modes keep Android in its normal recording route.
        // Only the voice-focused preset switches to the communication route.
        manager.mode = if (audioPickupMode == "voice") {
            AudioManager.MODE_IN_COMMUNICATION
        } else {
            AudioManager.MODE_NORMAL
        }
    }

    private fun audioConstraintsForPickupMode(): MediaConstraints {
        val echoCancellation = audioPickupMode == "voice"
        val noiseSuppression = audioPickupMode != "ambient"
        return MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", echoCancellation.toString()))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", noiseSuppression.toString()))
            // Keep gain control enabled so quiet ambient sounds remain audible.
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", (audioPickupMode != "ambient").toString()))
        }
    }

    private fun restoreAudioMode() {
        if (!audioModeChanged) return
        try {
            val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            manager.mode = previousAudioMode
        } catch (e: Exception) {
            Log.w("RemoteCameraRTC", "Could not restore Android audio mode", e)
        } finally {
            audioModeChanged = false
        }
    }

    /**
     * Prefer the rear camera with the widest reported horizontal field of view.
     * Some manufacturers expose only one logical rear camera; in that case we
     * fall back to Camera2Enumerator's first rear-facing camera.
     */
    private fun chooseWidestBackCamera(enumerator: Camera2Enumerator, names: Array<String>): String {
        val backNames = names.filter { enumerator.isBackFacing(it) }
        if (backNames.isEmpty()) {
            return names.firstOrNull() ?: error("利用できるカメラがありません。")
        }
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
        val best = backNames.mapNotNull { name ->
            try {
                val characteristics = manager.getCameraCharacteristics(name)
                val sensor = characteristics.get(android.hardware.camera2.CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
                val focal = characteristics.get(android.hardware.camera2.CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
                    ?.filter { it > 0f }?.minOrNull()
                val fieldOfView = if (sensor != null && focal != null) {
                    2.0 * atan(sensor.width.toDouble() / (2.0 * focal.toDouble()))
                } else {
                    0.0
                }
                name to fieldOfView
            } catch (e: Exception) {
                Log.w("RemoteCameraRTC", "Could not inspect camera " + name, e)
                null
            }
        }.maxByOrNull { it.second }
        val selected = best?.first ?: backNames.first()
        Log.i("RemoteCameraRTC", "Selected widest available rear camera: " + selected + ", horizontalFov=" + best?.second)
        return selected
    }

    private fun createCameraEventsHandler(): CameraVideoCapturer.CameraEventsHandler =
        object : CameraVideoCapturer.CameraEventsHandler {
            override fun onCameraError(errorDescription: String) {
                Log.e("RemoteCameraRTC", "Camera error: " + errorDescription)
                onState("Androidカメラエラー：" + errorDescription + "。カメラ再取得を試みます")
                scheduleCameraRecovery("camera error")
            }

            override fun onCameraDisconnected() {
                Log.w("RemoteCameraRTC", "Camera disconnected by Android camera service or a higher-priority app")
                onState("カメラがAndroid側で一時切断されました。カメラの再取得を試みます")
                scheduleCameraRecovery("camera disconnected")
            }

            override fun onCameraFreezed(errorDescription: String) {
                Log.e("RemoteCameraRTC", "Camera frame freeze: " + errorDescription)
                onState("カメラ映像が停止しました：" + errorDescription + "。再取得を試みます")
                scheduleCameraRecovery("camera freeze")
            }

            override fun onCameraOpening(cameraName: String) {
                Log.i("RemoteCameraRTC", "Opening camera: " + cameraName)
            }

            override fun onFirstFrameAvailable() {
                Log.i("RemoteCameraRTC", "First camera frame received")
            }

            override fun onCameraClosed() {
                Log.i("RemoteCameraRTC", "Camera closed")
            }
        }

    /**
     * Re-open the existing Camera2 capturer after Android or a higher-priority
     * app temporarily takes the camera. Keep the VideoSource/VideoTrack alive
     * so the current PeerConnection does not need a full renegotiation.
     */
    private fun scheduleCameraRecovery(reason: String) {
        if (peers.isEmpty() || !cameraRecoveryScheduled.compareAndSet(false, true)) return
        scope.launch(Dispatchers.IO) {
            try {
                for (attempt in 1..5) {
                    delay(1200L * attempt)
                    val restored = synchronized(this@RtcEngine) {
                        if (peers.isEmpty() || videoSource == null || helper == null) {
                            return@synchronized null
                        }
                        try {
                            val previous = capturer
                            capturer = null
                            try { previous?.stopCapture() } catch (e: Exception) {
                                Log.w("RemoteCameraRTC", "Previous capturer was already stopped", e)
                            }
                            try { previous?.dispose() } catch (_: Exception) {}

                            val enumerator = Camera2Enumerator(context)
                            val names = enumerator.deviceNames
                            val selected = if (frontCamera) {
                                names.firstOrNull { enumerator.isFrontFacing(it) }
                                    ?: chooseWidestBackCamera(enumerator, names)
                            } else {
                                chooseWidestBackCamera(enumerator, names)
                            }
                            val replacement = enumerator.createCapturer(
                                selected, createCameraEventsHandler()
                            ) ?: error("再取得できるカメラがありません。")
                            try {
                                replacement.initialize(
                                    helper, context.applicationContext, videoSource!!.capturerObserver
                                )
                                replacement.startCapture(captureWidth, captureHeight, captureFps)
                                capturer = replacement
                            } catch (e: Exception) {
                                try { replacement.dispose() } catch (_: Exception) {}
                                throw e
                            }
                            true
                        } catch (e: Exception) {
                            Log.w("RemoteCameraRTC", "Camera recovery attempt " + attempt + " failed", e)
                            false
                        }
                    }
                    if (restored == null) return@launch
                    if (restored == true) {
                        onState("カメラを再取得しました。映像接続を継続します")
                        return@launch
                    }
                    onState("カメラ再取得を試行中（" + attempt + "/5）")
                }
                onState("カメラを再取得できません。他のカメラアプリを閉じてから再接続してください")
            } finally {
                cameraRecoveryScheduled.set(false)
            }
        }
    }

    @Synchronized
    private fun ensureMedia() {
        if (factory != null && videoTrack != null && audioTrack != null && capturer != null) return
        if (factory == null) {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions()
            )
            egl = EglBase.create()
            audioDeviceModule = JavaAudioDeviceModule.builder(context.applicationContext)
                .setAudioSource(
                    if (audioPickupMode == "voice") MediaRecorder.AudioSource.VOICE_COMMUNICATION
                    else MediaRecorder.AudioSource.MIC
                )
                // Ambient mode deliberately disables processing that can remove quiet room sounds.
                .setUseHardwareAcousticEchoCanceler(audioPickupMode == "voice")
                .setUseHardwareNoiseSuppressor(audioPickupMode != "ambient")
                .createAudioDeviceModule()
            factory = PeerConnectionFactory.builder()
                .setAudioDeviceModule(audioDeviceModule!!)
                .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl!!.eglBaseContext, true, true))
                .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl!!.eglBaseContext))
                .createPeerConnectionFactory()
        }
        videoSource = factory!!.createVideoSource(false)
        val enumerator = Camera2Enumerator(context)
        val names = enumerator.deviceNames
        val selected = chooseWidestBackCamera(enumerator, names)
        currentCameraId = selected
        frontCamera = enumerator.isFrontFacing(selected)
        helper = SurfaceTextureHelper.create("RemoteCameraCapture", egl!!.eglBaseContext)
        val profile = profileFor(currentQuality, currentDataMode, currentCaptureRatio, currentFpsLimit)
        val captureSizes = (listOf(profile.width to profile.height) + fallbackDimensions(currentCaptureRatio)).distinct()
        var lastCaptureError: Exception? = null
        var captureStarted = false
        captureLoop@ for ((width, height) in captureSizes) {
            for (fps in listOf(30, 24, 20, 15)) {
                val candidate = enumerator.createCapturer(selected, createCameraEventsHandler())
                    ?: throw IllegalStateException("カメラを開けません。")
                try {
                    candidate.initialize(helper, context.applicationContext, videoSource!!.capturerObserver)
                    candidate.startCapture(width, height, fps)
                    capturer = candidate
                    captureWidth = width
                    captureHeight = height
                    captureFps = fps
                    captureStarted = true
                    Log.i("RemoteCameraRTC", "Camera capture started: ${width}x${height}@${fps}")
                    break@captureLoop
                } catch (e: Exception) {
                    lastCaptureError = e
                    Log.w("RemoteCameraRTC", "Capture format failed: ${width}x${height}@${fps}", e)
                    try { candidate.stopCapture() } catch (_: Exception) {}
                    try { candidate.dispose() } catch (_: Exception) {}
                }
            }
        }
        if (!captureStarted) throw lastCaptureError ?: IllegalStateException("対応する撮影形式がありません。")
        deferredFormatMessageFor = null
        enterCommunicationAudioMode()
        videoTrack = factory!!.createVideoTrack("remote-camera-video", videoSource).apply { setEnabled(true) }
        audioSource = factory!!.createAudioSource(audioConstraintsForPickupMode())
        audioTrack = factory!!.createAudioTrack("remote-camera-audio", audioSource).apply { setEnabled(true) }
        Log.i("RemoteCameraRTC", "Android microphone audio track created and enabled")
        onState("カメラ・マイクを起動しました")
    }

    fun handleOffer(sessionId: String, sdp: String) {
        try {
            val networkStateGranted =
                context.checkSelfPermission(Manifest.permission.ACCESS_NETWORK_STATE) == PackageManager.PERMISSION_GRANTED
            if (!networkStateGranted) {
                Log.e("RemoteCameraRTC", "ACCESS_NETWORK_STATE is missing; refusing to enter native WebRTC networking")
                onState("WebRTC接続を中止しました：ネットワーク状態の権限がAPKに含まれていません。最新版APKを再インストールしてください")
                return
            }
            Log.i("RemoteCameraRTC", "ACCESS_NETWORK_STATE permission verified before WebRTC initialization")
            // GAS polling can repeat a signal if a previous poll was interrupted
            // before its sequence cursor was committed. Do not tear down a live
            // camera/peer connection for a duplicate offer with the same session ID.
            if (peers.containsKey(sessionId)) {
                Log.i("RemoteCameraRTC", "Ignoring duplicate offer for active session " + sessionId)
                return
            }
            ensureMedia()
            // STUN helps peers discover a usable public-facing candidate. It does
            // not replace TURN, so restrictive networks may still require a relay.
            val iceServers = listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
                PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer()
            )
            val config = PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
                bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            }
            val answerSent = AtomicBoolean(false)
            lateinit var peer: PeerConnection
            val observer = object : PeerConnection.Observer {
                override fun onSignalingChange(state: PeerConnection.SignalingState) {}
                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                    iceStates[sessionId] = state
                    onState("WebRTC通信：" + state.name)
                    when (state) {
                        PeerConnection.IceConnectionState.CONNECTED,
                        PeerConnection.IceConnectionState.COMPLETED -> {
                            disconnectTimers.remove(sessionId)?.cancel()
                        }
                        PeerConnection.IceConnectionState.DISCONNECTED -> {
                            // DISCONNECTED can be a short Wi-Fi handover. Wait before
                            // disposing the peer so brief packet loss does not tear down video.
                            if (!disconnectTimers.containsKey(sessionId)) {
                                val timer = scope.launch(Dispatchers.IO) {
                                    delay(8000L)
                                    if (iceStates[sessionId] == PeerConnection.IceConnectionState.DISCONNECTED &&
                                        peers.remove(sessionId, peer)) {
                                        videoSenders.remove(sessionId)
                                        dataChannels.remove(sessionId)?.let {
                                            try { it.close() } catch (_: Exception) {}
                                        }
                                        iceStates.remove(sessionId)
                                        try { peer.close() } catch (_: Exception) {}
                                        if (peers.isEmpty()) stopMedia()
                                        onState("通信が8秒以上復帰しないため、この接続を終了しました。Webから再接続できます")
                                    }
                                    disconnectTimers.remove(sessionId)
                                }
                                val previous = disconnectTimers.putIfAbsent(sessionId, timer)
                                if (previous != null) timer.cancel()
                            }
                        }
                        PeerConnection.IceConnectionState.FAILED,
                        PeerConnection.IceConnectionState.CLOSED -> {
                            disconnectTimers.remove(sessionId)?.cancel()
                            peers.remove(sessionId)
                            videoSenders.remove(sessionId)
                            dataChannels.remove(sessionId)?.let {
                                try { it.close() } catch (_: Exception) {}
                            }
                            iceStates.remove(sessionId)
                            if (peers.isEmpty()) stopMedia()
                        }
                        else -> Unit
                    }
                }
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
                    if (state == PeerConnection.IceGatheringState.COMPLETE && answerSent.compareAndSet(false, true)) {
                        val local = peer.localDescription
                        if (local != null) scope.launch(Dispatchers.IO) {
                            try {
                                api.call("send_signal", JSONObject()
                                    .put("deviceId", deviceId).put("deviceSecret", secret)
                                    .put("sessionId", sessionId).put("recipient", "viewer")
                                    .put("kind", "answer").put("sdp", local.description))
                            } catch (e: Exception) {
                                onState("応答送信失敗: " + (e.message ?: "通信エラー"))
                            }
                        }
                    }
                }
                override fun onIceCandidate(candidate: IceCandidate) { }
                override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}
                override fun onAddStream(stream: MediaStream) {}
                override fun onRemoveStream(stream: MediaStream) {}
                override fun onDataChannel(channel: DataChannel) {
                    dataChannels[sessionId] = channel
                    channel.registerObserver(object : DataChannel.Observer {
                        override fun onBufferedAmountChange(previousAmount: Long) {}
                        override fun onStateChange() {
                            onState("操作用データチャネル：" + channel.state().name)
                        }
                                override fun onMessage(buffer: DataChannel.Buffer) {
                            if (buffer.binary) return
                            try {
                                val bytes = ByteArray(buffer.data.remaining())
                                buffer.data.get(bytes)
                                val message = JSONObject(String(bytes, Charsets.UTF_8))
                                if (message.optString("type") == "command") {
                                    if (message.optString("name") == "get_device_status") {
                                        sendDeviceStatus(message.optString("requestId"))
                                    } else {
                                        onControlCommand(message)
                                    }
                                }
                            } catch (e: Exception) {
                                Log.w("RemoteCameraRTC", "Invalid control data-channel message", e)
                            }
                        }
                    })
                }
                override fun onRenegotiationNeeded() {}
                override fun onAddTrack(receiver: RtpReceiver, streams: Array<MediaStream>) {}
            }
            peer = factory!!.createPeerConnection(config, observer)
                ?: error("PeerConnectionを作成できません。")
            peers[sessionId] = peer

            // The service is a single-viewer camera. Close stale sessions after
            // registering the new peer so their CLOSED callbacks do not dispose
            // the shared camera tracks used by the replacement session.
            peers.entries.toList().forEach { entry ->
                val oldSession = entry.key
                val oldPeer = entry.value
                if (oldSession != sessionId && peers.remove(oldSession, oldPeer)) {
                    disconnectTimers.remove(oldSession)?.cancel()
                    dataChannels.remove(oldSession)?.let {
                        try { it.close() } catch (_: Exception) {}
                    }
                    iceStates.remove(oldSession)
                    videoSenders.remove(oldSession)
                    try { oldPeer.close() } catch (e: Exception) {
                        Log.w("RemoteCameraRTC", "Could not close stale peer " + oldSession, e)
                    }
                }
            }

            videoSenders[sessionId] = peer.addTrack(videoTrack, listOf("remote-camera"))
            peer.addTrack(audioTrack, listOf("remote-camera"))
            applySenderParameters(profileFor(currentQuality, currentDataMode))
            peer.setRemoteDescription(object : SdpObserver {
                override fun onSetSuccess() {
                    peer.createAnswer(object : SdpObserver {
                        override fun onCreateSuccess(answer: SessionDescription) {
                            peer.setLocalDescription(object : SdpObserver {
                                override fun onSetSuccess() { onState("接続応答を作成中…") }
                                override fun onSetFailure(error: String) { onState("SDP設定失敗: $error") }
                                override fun onCreateSuccess(desc: SessionDescription) {}
                                override fun onCreateFailure(error: String) {}
                            }, answer)
                        }
                        override fun onCreateFailure(error: String) { onState("SDP応答作成失敗: $error") }
                        override fun onSetSuccess() {}
                        override fun onSetFailure(error: String) {}
                    }, MediaConstraints())
                }
                override fun onSetFailure(error: String) { onState("SDP受信失敗: $error") }
                override fun onCreateSuccess(desc: SessionDescription) {}
                override fun onCreateFailure(error: String) {}
            }, SessionDescription(SessionDescription.Type.OFFER, sdp))
        } catch (e: Exception) {
            Log.e("RemoteCameraRTC", "Offer processing failed; cleaning partial RTC state", e)
            try { peers.remove(sessionId)?.close() } catch (_: Exception) {}
            try { videoSenders.remove(sessionId) } catch (_: Exception) {}
            if (peers.isEmpty()) {
                try { stopMedia() } catch (_: Exception) {}
            }
            onState("WebRTC開始失敗：" + (e.message ?: "不明") + "。アプリの待機は継続します")
            scope.launch(Dispatchers.IO) {
                try {
                    api.call("send_signal", JSONObject()
                        .put("deviceId", deviceId).put("deviceSecret", secret)
                        .put("sessionId", sessionId).put("recipient", "viewer")
                        .put("kind", "error").put("sdp", e.message ?: "RTC error"))
                } catch (_: Exception) {}
            }
        }
    }

    @Synchronized
    fun closeSession(sessionId: String) {
        disconnectTimers.remove(sessionId)?.cancel()
        val channel = dataChannels.remove(sessionId)
        try { channel?.close() } catch (_: Exception) {}
        val peer = peers.remove(sessionId)
        videoSenders.remove(sessionId)
        iceStates.remove(sessionId)
        try { peer?.close() } catch (_: Exception) {}
        if (peers.isEmpty()) stopMedia()
    }

    fun hasPeers(): Boolean = peers.isNotEmpty()

    fun hasConnectedPeer(): Boolean = iceStates.entries.any { entry ->
        val connected = entry.value == PeerConnection.IceConnectionState.CONNECTED ||
            entry.value == PeerConnection.IceConnectionState.COMPLETED
        val channelOpen = dataChannels[entry.key]?.state() == DataChannel.State.OPEN
        connected && channelOpen
    }

    fun switchCamera(facing: String) {
        val camera = capturer ?: return
        val wantFront = facing == "front"
        if (wantFront == frontCamera) return
        if (flashlightEnabled) {
            try { setFlashlight(false) } catch (_: Exception) {}
        }
        camera.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFrontCamera: Boolean) {
                frontCamera = isFrontCamera
                val enumerator = Camera2Enumerator(context)
                currentCameraId = enumerator.deviceNames.firstOrNull {
                    if (isFrontCamera) enumerator.isFrontFacing(it) else enumerator.isBackFacing(it)
                }
                flashlightEnabled = false
                onState(if (isFrontCamera) "前面カメラ" else "背面カメラ")
            }
            override fun onCameraSwitchError(error: String) { onState("カメラ切替失敗: $error") }
        })
    }

    @Synchronized
    fun setFlashlight(enabled: Boolean) {
        val id = currentCameraId ?: throw IllegalStateException("カメラIDを取得できません。")
        if (frontCamera && enabled) throw IllegalStateException("ライトは背面カメラで使用してください。")
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val available = manager.getCameraCharacteristics(id)
            .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        if (!available && enabled) throw IllegalStateException("このカメラにはライトがありません。")
        try {
            manager.setTorchMode(id, enabled)
            flashlightEnabled = enabled
            onState(if (enabled) "スマホのライトをONにしました" else "スマホのライトをOFFにしました")
        } catch (e: Exception) {
            flashlightEnabled = false
            throw IllegalStateException("ライトを切り替えできません。カメラが使用中、または端末が非対応の可能性があります: ${e.message}")
        }
    }

    fun sendControlMessage(message: JSONObject) {
        val bytes = message.toString().toByteArray(Charsets.UTF_8)
        dataChannels.values.forEach { channel ->
            if (channel.state() == DataChannel.State.OPEN) {
                try { channel.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), false)) }
                catch (e: Exception) { Log.w("RemoteCameraRTC", "Could not send control response", e) }
            }
        }
    }

    private fun sendDeviceStatus(requestId: String) {
        val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val battery = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val plugged = batteryIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val temperature = batteryIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
        val flashAvailable = try {
            val id = currentCameraId
            id != null && (context.getSystemService(Context.CAMERA_SERVICE) as CameraManager)
                .getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        } catch (_: Exception) { false }
        sendControlMessage(JSONObject()
            .put("type", "device_status")
            .put("requestId", requestId)
            .put("batteryPercent", battery)
            .put("charging", plugged != 0 || status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL)
            .put("batteryTempC", if (temperature >= 0) temperature / 10.0 else JSONObject.NULL)
            .put("flashlightAvailable", flashAvailable)
            .put("flashlightOn", flashlightEnabled)
            .put("cameraFacing", if (frontCamera) "front" else "back")
        )
    }

    fun setQuality(quality: String, dataMode: String) {
        setVideoProfile(quality, dataMode, currentCaptureRatio, currentFpsLimit)
    }

    @Synchronized
    fun setVideoProfile(quality: String, dataMode: String, ratio: String, fpsLimit: Int) {
        val normalizedQuality = if (quality in listOf("auto", "360", "480", "720", "1080")) quality else "720"
        val normalizedMode = if (dataMode in listOf("auto", "ultra", "save", "standard", "high")) dataMode else "standard"
        val normalizedRatio = if (ratio in listOf("16:9", "4:3", "1:1", "9:16")) ratio else "16:9"
        val normalizedFps = fpsLimit.coerceIn(15, 30)
        val changed = normalizedQuality != currentQuality || normalizedMode != currentDataMode ||
            normalizedRatio != currentCaptureRatio || normalizedFps != currentFpsLimit
        if (!changed) return

        currentQuality = normalizedQuality
        currentDataMode = normalizedMode
        currentCaptureRatio = normalizedRatio
        currentFpsLimit = normalizedFps
        val profile = profileFor(currentQuality, currentDataMode, currentCaptureRatio, currentFpsLimit)
        val camera = capturer
        val formatChanged = camera != null &&
            (profile.width != captureWidth || profile.height != captureHeight)

        // Live FPS/bitrate updates do not restart Camera2. Resolution/aspect changes
        // remain deferred until the next session to avoid a visible video freeze.
        if (formatChanged && peers.isEmpty()) {
            try {
                camera!!.changeCaptureFormat(profile.width, profile.height, captureFps)
                captureWidth = profile.width
                captureHeight = profile.height
                deferredFormatMessageFor = null
            } catch (e: Exception) {
                Log.w("RemoteCameraRTC", "Could not change camera capture format while idle", e)
                onState("画角・解像度は次回接続時に適用します。")
            }
        } else if (formatChanged && peers.isNotEmpty()) {
            val key = "${profile.width}x${profile.height}@${profile.fps}/${profile.bitrate}"
            if (deferredFormatMessageFor != key) {
                deferredFormatMessageFor = key
                onState("FPSと送信レートは即時反映しました。画角・解像度は次回接続時に適用します。")
            }
        }
        applySenderParameters(profile)
    }

    private fun applySenderParameters(profile: VideoProfile) {
        videoSenders.values.forEach { sender ->
            try {
                val params = sender.parameters
                params.encodings.forEach { encoding ->
                    encoding.maxBitrateBps = profile.bitrate
                    encoding.maxFramerate = profile.fps
                }
                if (!sender.setParameters(params)) {
                    Log.w("RemoteCameraRTC", "Video sender rejected quality parameters")
                }
            } catch (e: Exception) {
                Log.w("RemoteCameraRTC", "Could not update video sender parameters", e)
            }
        }
    }

    @Synchronized
    private fun stopMedia() {
        if (flashlightEnabled) {
            try { currentCameraId?.let { (context.getSystemService(Context.CAMERA_SERVICE) as CameraManager).setTorchMode(it, false) } }
            catch (e: Exception) { Log.w("RemoteCameraRTC", "Could not turn off flashlight during media stop", e) }
            flashlightEnabled = false
        }
        try { capturer?.stopCapture() } catch (_: Exception) {}
        try { capturer?.dispose() } catch (_: Exception) {}
        capturer = null
        try { helper?.dispose() } catch (_: Exception) {}
        helper = null
        try { videoTrack?.dispose() } catch (_: Exception) {}
        videoTrack = null
        try { audioTrack?.dispose() } catch (_: Exception) {}
        audioTrack = null
        try { videoSource?.dispose() } catch (_: Exception) {}
        videoSource = null
        try { audioSource?.dispose() } catch (_: Exception) {}
        audioSource = null
        restoreAudioMode()
    }

    fun dispose() {
        disconnectTimers.values.forEach { it.cancel() }
        disconnectTimers.clear()
        dataChannels.values.forEach { try { it.close() } catch (_: Exception) {} }
        dataChannels.clear()
        iceStates.clear()
        peers.values.forEach { try { it.close() } catch (_: Exception) {} }
        peers.clear()
        videoSenders.clear()
        stopMedia()
        try { factory?.dispose() } catch (_: Exception) {}
        factory = null
        try { audioDeviceModule?.release() } catch (_: Exception) {}
        audioDeviceModule = null
        restoreAudioMode()
        try { egl?.release() } catch (_: Exception) {}
        egl = null
    }
}