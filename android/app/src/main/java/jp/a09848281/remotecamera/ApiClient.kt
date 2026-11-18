package jp.a09848281.remotecamera

import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiClient(private val gasUrl: String) {
    private val retryableActions = setOf(
        "health", "device_poll", "poll_signals", "get_settings", "get_locations"
    )

    fun call(action: String, values: JSONObject = JSONObject()): JSONObject {
        val attempts = if (action in retryableActions) 3 else 1
        var lastError: IOException? = null
        for (attempt in 0 until attempts) {
            try {
                return callOnce(action, values)
            } catch (e: IOException) {
                lastError = e
                Log.w("RemoteCameraAPI", "Transient GAS transport error for " + action + " (" + (attempt + 1) + "/" + attempts + ")", e)
                if (attempt + 1 < attempts) {
                    try { Thread.sleep(300L * (attempt + 1)) } catch (interrupted: InterruptedException) {
                        Thread.currentThread().interrupt()
                        throw IOException("GAS再試行が中断されました。", interrupted)
                    }
                }
            }
        }
        throw lastError ?: IOException("GASへの接続に失敗しました。")
    }

    private fun callOnce(action: String, values: JSONObject): JSONObject {
        require(gasUrl.startsWith("https://script.google.com/")) { "GAS URLが正しくありません。" }
        val payload = JSONObject(values.toString()).put("action", action)
        val body = "payload=" + URLEncoder.encode(payload.toString(), "UTF-8") + "&mode=json"
        val connection = URL(gasUrl).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.connectTimeout = 8000
        connection.readTimeout = 12000
        connection.instanceFollowRedirects = false
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        connection.setRequestProperty("Accept", "application/json")
        try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            if (code == 429 || code >= 500) {
                throw IOException("GAS一時エラー：HTTP " + code)
            }
            val text = if (code in 300..399) {
                val location = connection.getHeaderField("Location")
                    ?: error("GAS redirect URLがありません。HTTP $code")
                val redirectUrl = URL(location)
                val redirectHost = redirectUrl.host.lowercase()
                require(
                    redirectUrl.protocol == "https" &&
                    (redirectHost == "script.googleusercontent.com" ||
                        redirectHost.endsWith(".googleusercontent.com"))
                ) { "GASから許可されていないリダイレクト先が返されました。" }
                connection.disconnect()
                val redirected = redirectUrl.openConnection() as HttpURLConnection
                redirected.connectTimeout = 8000
                redirected.readTimeout = 12000
                try {
                    val redirectedCode = redirected.responseCode
                    if (redirectedCode == 429 || redirectedCode >= 500) {
                        throw IOException("GAS一時エラー：リダイレクト先HTTP " + redirectedCode)
                    }
                    val stream = if (redirectedCode >= 400) redirected.errorStream else redirected.inputStream
                    BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
                } finally { redirected.disconnect() }
            } else {
                val stream = if (code >= 400) connection.errorStream else connection.inputStream
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            }
            val result = try { JSONObject(text) } catch (e: Exception) {
                throw IOException("GASからJSON以外の応答が返されました。デプロイ状態を確認してください。", e)
            }
            if (!result.optBoolean("ok", false)) error(result.optString("error", "GAS APIエラー"))
            Log.d("RemoteCameraAPI", "action=" + action + " serverMs=" + result.optLong("serverMs", -1L))
            return result
        } finally {
            try { connection.disconnect() } catch (_: Exception) {}
        }
    }
}