#!/usr/bin/env bash
# 出片前环境自检：缺什么直接说，不要等到出片跑到一半才报错。
# 用法： bash scripts/check-env.sh
set -uo pipefail
ok=0; warn=0
pass(){ printf "  ✓ %s\n" "$1"; }
fail(){ printf "  ✗ %s\n     → %s\n" "$1" "$2"; ok=1; }
warnf(){ printf "  ! %s\n     → %s\n" "$1" "$2"; warn=1; }

echo "▸ 环境自检"

# ffmpeg
if command -v ffmpeg >/dev/null 2>&1; then
  pass "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
  ffmpeg -encoders 2>/dev/null | grep -q libx264 \
    && pass "libx264 编码器可用" \
    || fail "ffmpeg 缺少 libx264" "安装完整版 ffmpeg：macOS: brew install ffmpeg ｜ Ubuntu: apt install ffmpeg"
  ffmpeg -encoders 2>/dev/null | grep -q " aac " \
    && pass "AAC 编码器可用" \
    || fail "ffmpeg 缺少 aac 编码器" "安装完整版 ffmpeg"
else
  fail "未找到 ffmpeg" "macOS: brew install ffmpeg ｜ Ubuntu: apt install ffmpeg"
fi
command -v ffprobe >/dev/null 2>&1 && pass "ffprobe 可用" || fail "未找到 ffprobe" "随 ffmpeg 一起安装"

# node
if command -v node >/dev/null 2>&1; then
  v=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$v" -ge 22 ] 2>/dev/null; then pass "node $(node -v)"
  else fail "node 版本过低（$(node -v)）" "需要 ≥ 22（自带 WebSocket，CDP 录屏依赖），升级：https://nodejs.org"; fi
else
  fail "未找到 node" "安装 Node.js ≥ 22"
fi

# python3
command -v python3 >/dev/null 2>&1 && pass "python3 $(python3 -V 2>&1 | awk '{print $2}')" \
  || fail "未找到 python3" "安装 Python 3"

# Chrome
CH=$(node -e "const f=require('$(cd "$(dirname "$0")" && pwd)/__chrome.js');const c=f();console.log(c||'')" 2>/dev/null)
if [ -n "$CH" ]; then pass "Chrome: $CH"
else fail "未找到 Chrome / Chromium" "export CHROME_BIN=/path/to/chrome，或安装 Google Chrome"; fi

# 语音合成 provider（至少有一个可用）
echo "  ── 语音合成 ──"
PROV=""
ENVF="${TTS_ENV:-$HOME/.config/live-video/.env}"
if [ -f "${ENVF}" ] && grep -q TENCENT_SECRET_ID "${ENVF}" 2>/dev/null; then
  pass "tencent（凭证：${ENVF}）"; PROV="tencent"
else
  printf "  · tencent：未配置凭证（${ENVF}）\n"
fi
EDGE_OK=$(python3 -c "
import sys; sys.path.insert(0, '$(cd "$(dirname "$0")" && pwd)')
try:
    import synth; print('1' if synth._edge_ok() else '0')
except Exception: print('0')
" 2>/dev/null)
if [ "$EDGE_OK" = "1" ]; then
  pass "edge（edge-tts 可用，免密钥）"; [ -z "$PROV" ] && PROV="edge"
else
  warnf "edge 未安装（免密钥、音质好，推荐）" "bash scripts/synth.py --setup-edge   # 自动建独立 venv，不动系统 Python"
fi
if [ "$(uname)" = "Darwin" ] && command -v say >/dev/null 2>&1; then
  pass "say（macOS 自带，免密钥）"; [ -z "$PROV" ] && PROV="say"
else
  printf "  · say：不可用（仅 macOS）\n"
fi
if [ -z "$PROV" ]; then
  warnf "没有任何可用的语音合成 provider" "pip install edge-tts（免费免密钥），或配置腾讯云凭证，或用 SILENT=1 静音出片"
else
  echo "  → 默认将使用：$PROV"
fi

echo
if [ "$ok" = "1" ]; then echo "✗ 有必装项缺失，请先解决上面标 ✗ 的问题。"; exit 1; fi
[ "$warn" = "1" ] && echo "✓ 出片环境就绪（有 1 项可选未配置，见上面 ! ）" || echo "✓ 出片环境完全就绪"
