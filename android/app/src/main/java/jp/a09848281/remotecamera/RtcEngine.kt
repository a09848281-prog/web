package jp.a09848281.remotecamera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.atan

class RtcEngine(
    private val context: Context,
    private val api: ApiClient,
    private val deviceId: String,
    private val secret: String,
    private val scope: CoroutineScope,
    private val onState: (String) -> Unit
) {
    private val peers = ConcurrentHashMap<String, PeerConnection>()
    private val videoSenders = ConcurrentHashMap<String, RtpSender>()
    private var factory: PeerConnectionFactory? = null
    private var egl: EglBase? = null
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

    private data class VideoProfile(
        val width: Int, val height: Int, val fps: Int, val bitrate: Int
    )

    private fun profileFor(quality: String, dataMode: String): VideoProfile {
        // Use 16:9 capture modes. The old 640x480 default caused a 4:3 crop
        // and quality="720" accidentally fell through to VGA.
        val base = when (quality) {
            "360" -> VideoProfile(640, 360, 15, 420000)
            "480" -> VideoProfile(854, 480, 20, 650000)
            "1080" -> VideoProfile(1920, 1080, 24, 1800000)
            "auto" -> VideoProfile(1280, 720, 20, 850000)
            else -> VideoProfile(1280, 720, 24, 1000000)
        }
        return when (dataMode) {
            "ultra" -> VideoProfile(640, 360, 10, 250000)
            "save" -> VideoProfile(854, 480, 15, 450000)
            "auto" -> base.copy(fps = minOf(base.fps, 20), bitrate = minOf(base.bitrate, 800000))
            "high" -> base.copy(fps = minOf(base.fps, 30), bitrate = minOf(base.bitrate, 2000000))
            else -> base
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

    @Synchronized
    private fun ensureMedia() {
        if (factory != null && videoTrack != null && audioTrack != null && capturer != null) return
        if (factory == null) {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions()
            )
            egl = EglBase.create()
            factory = PeerConnectionFactory.builder()
                .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl!!.eglBaseContext, true, true))
                .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl!!.eglBaseContext))
                .createPeerConnectionFactory()
        }
        videoSource = factory!!.createVideoSource(false)
        val enumerator = Camera2Enumerator(context)
        val names = enumerator.deviceNames
        val selected = chooseWidestBackCamera(enumerator, names)
        frontCamera = enumerator.isFrontFacing(selected)
        capturer = enumerator.createCapturer(selected, null) ?: error("カメラを開けません。")
        helper = SurfaceTextureHelper.create("RemoteCameraCapture", egl!!.eglBaseContext)
        capturer!!.initialize(helper, context.applicationContext, videoSource!!.capturerObserver)
        val profile = profileFor(currentQuality, currentDataMode)
        captureWidth = profile.width
        captureHeight = profile.height
        captureFps = profile.fps
        try {
            capturer!!.startCapture(profile.width, profile.height, profile.fps)
        } catch (first: Exception) {
            Log.w("RemoteCameraRTC", "Preferred 16:9 format failed; retrying 960x540", first)
            try { capturer?.dispose() } catch (_: Exception) {}
            capturer = enumerator.createCapturer(selected, null) ?: throw first
            capturer!!.initialize(helper, context.applicationContext, videoSource!!.capturerObserver)
            try {
                capturer!!.startCapture(960, 540, 20)
                captureWidth = 960
                captureHeight = 540
                captureFps = 20
            } catch (second: Exception) {
                Log.w("RemoteCameraRTC", "960x540 failed; retrying 640x360", second)
                try { capturer?.dispose() } catch (_: Exception) {}
                capturer = enumerator.createCapturer(selected, null) ?: throw second
                capturer!!.initialize(helper, context.applicationContext, videoSource!!.capturerObserver)
                capturer!!.startCapture(640, 360, 15)
                captureWidth = 640
                captureHeight = 360
                captureFps = 15
            }
        }
        videoTrack = factory!!.createVideoTrack("remote-camera-video", videoSource).apply { setEnabled(true) }
        audioSource = factory!!.createAudioSource(MediaConstraints())
        audioTrack = factory!!.createAudioTrack("remote-camera-audio", audioSource).apply { setEnabled(true) }
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
            peers.remove(sessionId)?.close()
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
                    onState("WebRTC: " + state.name)
                    if (state == PeerConnection.IceConnectionState.FAILED ||
                        state == PeerConnection.IceConnectionState.CLOSED) {
                        peers.remove(sessionId)
                        videoSenders.remove(sessionId)
                        if (peers.isEmpty()) stopMedia()
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
                override fun onDataChannel(channel: DataChannel) {}
                override fun onRenegotiationNeeded() {}
                override fun onAddTrack(receiver: RtpReceiver, streams: Array<MediaStream>) {}
            }
            peer = factory!!.createPeerConnection(config, observer)
                ?: error("PeerConnectionを作成できません。")
            peers[sessionId] = peer
            videoSenders[sessionId] = peer.addTrack(videoTrack, listOf("remote-camera"))
            peer.addTrack(audioTrack, listOf("remote-camera"))
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
        val peer = peers.remove(sessionId)
        videoSenders.remove(sessionId)
        try { peer?.close() } catch (_: Exception) {}
        if (peers.isEmpty()) stopMedia()
    }

    fun hasPeers(): Boolean = peers.isNotEmpty()

    fun switchCamera(facing: String) {
        val camera = capturer ?: return
        val wantFront = facing == "front"
        if (wantFront == frontCamera) return
        camera.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFrontCamera: Boolean) {
                frontCamera = isFrontCamera
                onState(if (isFrontCamera) "前面カメラ" else "背面カメラ")
            }
            override fun onCameraSwitchError(error: String) { onState("カメラ切替失敗: $error") }
        })
    }

    fun setQuality(quality: String, dataMode: String) {
        currentQuality = quality
        currentDataMode = dataMode
        val profile = profileFor(currentQuality, currentDataMode)
        val camera = capturer
        if (camera != null &&
            (profile.width != captureWidth || profile.height != captureHeight || profile.fps != captureFps)
        ) {
            try {
                camera.changeCaptureFormat(profile.width, profile.height, profile.fps)
                captureWidth = profile.width
                captureHeight = profile.height
                captureFps = profile.fps
            } catch (e: Exception) {
                Log.w("RemoteCameraRTC", "Could not change camera capture format", e)
                onState("画質変更に失敗しました。端末が対応する画質を確認してください。")
            }
        }
        videoSenders.values.forEach { sender ->
            try {
                val params = sender.parameters
                params.encodings.forEach {
                    it.maxBitrateBps = profile.bitrate
                    it.maxFramerate = profile.fps
                }
                if (!sender.setParameters(params)) {
                    Log.w("RemoteCameraRTC", "Video sender rejected quality parameters")
                }
            } catch (e: Exception) {
                Log.w("RemoteCameraRTC", "Could not change video bitrate", e)
            }
        }
    }

    @Synchronized
    private fun stopMedia() {
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
    }

    fun dispose() {
        peers.values.forEach { try { it.close() } catch (_: Exception) {} }
        peers.clear()
        videoSenders.clear()
        stopMedia()
        try { factory?.dispose() } catch (_: Exception) {}
        factory = null
        try { egl?.release() } catch (_: Exception) {}
        egl = null
    }
}