package jp.a09848281.remotecamera

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

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
        val selected = names.firstOrNull { enumerator.isBackFacing(it) }
            ?: names.firstOrNull { enumerator.isFrontFacing(it) }
            ?: names.firstOrNull()
            ?: error("利用できるカメラがありません。")
        frontCamera = enumerator.isFrontFacing(selected)
        capturer = enumerator.createCapturer(selected, null) ?: error("カメラを開けません。")
        helper = SurfaceTextureHelper.create("RemoteCameraCapture", egl!!.eglBaseContext)
        capturer!!.initialize(helper, context.applicationContext, videoSource!!.capturerObserver)
        capturer!!.startCapture(1280, 720, 24)
        videoTrack = factory!!.createVideoTrack("remote-camera-video", videoSource).apply { setEnabled(true) }
        audioSource = factory!!.createAudioSource(MediaConstraints())
        audioTrack = factory!!.createAudioTrack("remote-camera-audio", audioSource).apply { setEnabled(true) }
        onState("カメラ・マイクを起動しました")
    }

    fun handleOffer(sessionId: String, sdp: String) {
        try {
            peers.remove(sessionId)?.close()
            ensureMedia()
            val config = PeerConnection.RTCConfiguration(emptyList()).apply {
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
            Log.e("RemoteCameraRTC", "Offer processing failed", e)
            onState("WebRTC開始失敗: " + (e.message ?: "不明"))
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
        val (bitrate, fps) = when (dataMode) {
            "ultra" -> Pair(280000, 10)
            "save" -> Pair(550000, 15)
            "high" -> Pair(2400000, 30)
            else -> when (quality) {
                "360" -> Pair(350000, 15)
                "480" -> Pair(650000, 20)
                "1080" -> Pair(2200000, 30)
                else -> Pair(1200000, 24)
            }
        }
        videoSenders.values.forEach { sender ->
            try {
                val params = sender.parameters
                params.encodings.forEach { it.maxBitrateBps = bitrate; it.maxFramerate = fps }
                sender.setParameters(params)
            } catch (e: Exception) { Log.w("RemoteCameraRTC", "Could not change video bitrate", e) }
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