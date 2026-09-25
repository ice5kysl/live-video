#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
腾讯云语音合成（基础语音合成 TextToVoice）客户端 —— 仅用标准库，手写 TC3-HMAC-SHA256 签名。

凭证来源按以下顺序查找：
  1. 环境变量 TTS_ENV 指向的 .env 文件
  2. ~/.config/live-video/.env
.env 里需要两行：
  TENCENT_SECRET_ID=xxx
  TENCENT_SECRET_KEY=xxx
（在腾讯云控制台创建「子账号」并只授予语音合成权限，不要用主账号密钥）
"""
import hashlib, hmac, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

ENV_PATH = os.environ.get("TTS_ENV") or os.path.expanduser("~/.config/live-video/.env")

def load_env(path=ENV_PATH):
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

_HOST = "tts.tencentcloudapi.com"
_SERVICE = "tts"
_VERSION = "2019-08-23"
_ACTION = "TextToVoice"

def _sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

def tts(text, voice_type, speed=0.0, volume=0.0, codec="mp3",
        region=None, env=None, timeout=30):
    env = env or load_env()
    sid, skey = env["TENCENT_SECRET_ID"], env["TENCENT_SECRET_KEY"]
    region = region or env.get("TENCENT_TTS_REGION", "ap-beijing")

    payload = json.dumps({
        "Text": text,
        "SessionId": "rmc-%d" % int(time.time() * 1000),
        "VoiceType": int(voice_type),
        "Speed": float(speed),
        "Volume": float(volume),
        "Codec": codec,
        "SampleRate": 16000,
    }, ensure_ascii=False, separators=(",", ":"))

    ts = int(time.time())
    date = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
    hashed_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_headers = "content-type:application/json; charset=utf-8\nhost:%s\nx-tc-action:%s\n" % (_HOST, _ACTION.lower())
    signed_headers = "content-type;host;x-tc-action"
    canonical_request = "\n".join(["POST", "/", "", canonical_headers, signed_headers, hashed_payload])
    credential_scope = "%s/%s/tc3_request" % (date, _SERVICE)
    string_to_sign = "\n".join([
        "TC3-HMAC-SHA256", str(ts), credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    secret_date = _sign(("TC3" + skey).encode("utf-8"), date)
    secret_service = _sign(secret_date, _SERVICE)
    secret_signing = _sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = ("TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s"
                     % (sid, credential_scope, signed_headers, signature))

    req = urllib.request.Request("https://" + _HOST, data=payload.encode("utf-8"), method="POST")
    req.add_header("Authorization", authorization)
    req.add_header("Content-Type", "application/json; charset=utf-8")
    req.add_header("Host", _HOST)
    req.add_header("X-TC-Action", _ACTION)
    req.add_header("X-TC-Version", _VERSION)
    req.add_header("X-TC-Timestamp", str(ts))
    req.add_header("X-TC-Region", region)

    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = json.loads(r.read().decode("utf-8"))
    resp = body.get("Response", {})
    if "Error" in resp:
        raise RuntimeError("%s: %s" % (resp["Error"].get("Code"), resp["Error"].get("Message")))
    import base64
    return base64.b64decode(resp["Audio"]), resp.get("RequestId", "")

if __name__ == "__main__":
    import base64
    env = load_env()
    print("凭证: SecretId=%s…  Region=%s  默认音色=%s"
          % (env["TENCENT_SECRET_ID"][:8], env.get("TENCENT_TTS_REGION"), env.get("TENCENT_TTS_VOICE_TYPE")))
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/tts_test.mp3"
    vt = sys.argv[2] if len(sys.argv) > 2 else env.get("TENCENT_TTS_VOICE_TYPE", "101030")
    data, rid = tts("安全督查，正在进入下一个阶段。", vt, env=env)
    open(out, "wb").write(data)
    print("音色 %s → %s  %d 字节  RequestId=%s" % (vt, out, len(data), rid))
