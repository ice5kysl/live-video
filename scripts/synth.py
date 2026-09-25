#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统一语音合成接口 —— 支持多个 provider，按可用性自动选择。

    TTS_PROVIDER=auto（默认）时的优先顺序：
      tencent → 腾讯云语音合成   质量最好，需要密钥
      edge    → edge-tts         免费免密钥，跨平台（系统 Python 里没装时会自动用
                                  ~/.local/share/live-video/venv 里的那份）
      say     → macOS say        零依赖，仅 macOS，中文音质一般

    也可以强制指定： TTS_PROVIDER=tencent | edge | say

对外接口：
    detect()                         → 返回可用的 provider 名，都不行则 None
    voices(provider)                 → 该 provider 的推荐音色表
    synth(text, out_wav, ...)        → 合成到 wav（44.1kHz 单声道），返回秒数
"""
import os, shutil, subprocess, sys, tempfile

# ---- 各 provider 的推荐音色 -------------------------------------------------
VOICES = {
    "tencent": {
        "narrator_m": "502005",   # 智小解 · 解说男声（默认）
        "narrator_f": "502003",   # 智小敏 · 聊天女声
        "senior_m":   "603006",   # 沉稳青叔 · 男
        "young_f":    "603007",   # 邻家女孩 · 女
    },
    "edge": {
        "narrator_m": "zh-CN-YunxiNeural",    # 云希 · 男（默认，适合解说）
        "narrator_f": "zh-CN-XiaoxiaoNeural", # 晓晓 · 女
        "senior_m":   "zh-CN-YunjianNeural",  # 云健 · 男（沉稳）
        "young_f":    "zh-CN-XiaoyiNeural",   # 晓伊 · 女（年轻）
    },
    "say": {
        "narrator_m": "Tingting",   # 婷婷（macOS 中文女声，最稳）
        "narrator_f": "Tingting",
        "senior_m":   "Tingting",
        "young_f":    "Tingting",
    },
}
DEFAULT_VOICE = {p: v["narrator_m"] for p, v in VOICES.items()}

# ---- edge-tts 的独立 venv（避免动系统 Python，绕开 PEP 668）-----------------
VENV_DIR = os.environ.get("LIVE_VIDEO_VENV") or os.path.expanduser("~/.local/share/live-video/venv")
_VENV_PY_CACHE = ""

def venv_python():
    """返回独立 venv 里的 python 路径，没有则 ''。"""
    global _VENV_PY_CACHE
    if _VENV_PY_CACHE:
        return _VENV_PY_CACHE
    for rel in ("bin/python3", "bin/python", "Scripts/python.exe"):
        p = os.path.join(VENV_DIR, rel)
        if os.path.exists(p):
            _VENV_PY_CACHE = p
            return p
    return ""

_EDGE_VENV_OK = None
def _venv_has_edge():
    global _EDGE_VENV_OK
    if _EDGE_VENV_OK is None:
        py = venv_python()
        if not py:
            _EDGE_VENV_OK = False
        else:
            _EDGE_VENV_OK = subprocess.run([py, "-c", "import edge_tts"],
                                           capture_output=True).returncode == 0
    return _EDGE_VENV_OK

def setup_edge(quiet=False):
    """建独立 venv 并安装 edge-tts（免密钥）。返回是否成功。"""
    log = (lambda *a: None) if quiet else print
    log("  建 venv: %s" % VENV_DIR)
    os.makedirs(os.path.dirname(VENV_DIR), exist_ok=True)
    if subprocess.run([sys.executable, "-m", "venv", VENV_DIR]).returncode != 0:
        return False
    pip = os.path.join(VENV_DIR, "bin", "pip")
    if not os.path.exists(pip):
        pip = os.path.join(VENV_DIR, "Scripts", "pip.exe")
    log("  安装 edge-tts …")
    if subprocess.run([pip, "install", "-q", "--upgrade", "pip"]).returncode != 0:
        pass  # 升级 pip 失败不影响
    ok = subprocess.run([pip, "install", "-q", "edge-tts"]).returncode == 0
    log("  %s" % ("✓ edge-tts 安装完成" if ok else "✗ 安装失败，请检查网络后重试"))
    return ok

# ---- 可用性探测 -------------------------------------------------------------
def _edge_ok():
    try:
        import edge_tts  # noqa
        return True
    except Exception:
        return bool(venv_python()) and _venv_has_edge()

def _say_ok():
    return sys.platform == "darwin" and bool(shutil.which("say"))

def _tencent_ok():
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from tencent_tts import load_env
        load_env()
        return True
    except Exception:
        return False

def detect():
    """返回第一个可用的 provider；显式指定时按指定的来（不可用则报错）。"""
    forced = os.environ.get("TTS_PROVIDER", "auto").lower()
    if forced != "auto":
        if forced == "tencent" and _tencent_ok(): return "tencent"
        if forced == "edge" and _edge_ok():       return "edge"
        if forced == "say" and _say_ok():         return "say"
        raise RuntimeError("指定的 TTS_PROVIDER=%s 不可用，见下方说明" % forced)
    for p in ("tencent", "edge", "say"):
        if {"tencent": _tencent_ok, "edge": _edge_ok, "say": _say_ok}[p]():
            return p
    return None

def provider_hint():
    return "\n".join([
        "",
        "✗ 没有可用的语音合成 provider。任选一种：",
        "",
        "  ① edge-tts —— 免费、免密钥、跨平台（推荐给没有云账号的人）",
        "       python3 %s --setup-edge" % os.path.abspath(__file__),
        "       （会在 ~/.local/share/live-video/venv 建独立环境，不动系统 Python）",
        "",
        "  ② 腾讯云语音合成 —— 质量最好，需要密钥",
        "       mkdir -p ~/.config/live-video",
        "       printf 'TENCENT_SECRET_ID=xxx\\nTENCENT_SECRET_KEY=xxx\\n' > ~/.config/live-video/.env",
        "       （控制台建「子账号」并只授予语音合成权限，不要用主账号密钥）",
        "",
        "  ③ macOS 自带 say —— 零依赖，仅 macOS，中文音质一般",
        "       （macOS 上开箱即用，无需安装）",
        "",
        "  ④ 完全跳过配音，先跑通链路",
        "       SILENT=1 HTML=页面.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh",
        "",
    ])

# ---- 各 provider 的实现 -----------------------------------------------------
def _to_wav(src, out_wav):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                    "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out_wav], check=True)
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", out_wav],
                                capture_output=True, text=True).stdout)

def _synth_tencent(text, out_wav, voice, speed):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from tencent_tts import tts, load_env
    data, _ = tts(text, voice, speed=float(speed), env=load_env())
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(data); tmp = f.name
    try:
        return _to_wav(tmp, out_wav)
    finally:
        os.unlink(tmp)

_EDGE_SNIPPET = (
    "import asyncio,sys,edge_tts;"
    "asyncio.run(edge_tts.Communicate(sys.argv[1],sys.argv[2],rate=sys.argv[3]).save(sys.argv[4]))"
)

def _synth_edge(text, out_wav, voice, speed):
    # Speed(腾讯云口径 0/±1/±2) → edge 的百分比。经验换算：每档 ≈ ±18%
    rate = "%+d%%" % int(round(float(speed) * 18))
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp = f.name
    try:
        try:
            import asyncio, edge_tts
            asyncio.run(edge_tts.Communicate(text, voice, rate=rate).save(tmp))
        except ImportError:
            py = venv_python()
            if not py or not _venv_has_edge():
                raise RuntimeError(
                    "edge-tts 不可用。安装方式（免密钥）：\n"
                    "    python3 %s --setup-edge" % os.path.abspath(__file__))
            subprocess.run([py, "-c", _EDGE_SNIPPET, text, voice, rate, tmp], check=True)
        return _to_wav(tmp, out_wav)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

def _synth_say(text, out_wav, voice, speed):
    # say 的 -r 是「词/分钟」，中文按经验值映射：默认 180，每档 ±30
    rate = str(int(180 + float(speed) * 30))
    tmp = out_wav + ".aiff"
    subprocess.run(["say", "-v", voice, "-r", rate, "-o", tmp, text], check=True)
    try:
        return _to_wav(tmp, out_wav)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

_IMPL = {"tencent": _synth_tencent, "edge": _synth_edge, "say": _synth_say}

def synth(text, out_wav, provider=None, voice=None, speed=0.0):
    """合成 text 到 out_wav（44.1kHz 单声道 wav），返回时长（秒）。"""
    provider = provider or detect()
    if not provider:
        raise RuntimeError(provider_hint())
    voice = voice or DEFAULT_VOICE[provider]
    return _IMPL[provider](text, out_wav, voice, speed)


if __name__ == "__main__":
    if "--setup-edge" in sys.argv:
        sys.exit(0 if setup_edge() else 1)
    p = detect()
    print("检测到可用 provider：%s" % (p or "无"))
    if p:
        print("默认音色：%s" % DEFAULT_VOICE[p])
        print("可选音色：%s" % VOICES[p])
