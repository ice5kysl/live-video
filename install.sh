#!/usr/bin/env bash
# =============================================================================
#  Live-Video 一键安装
#
#  最简用法（装到当前项目，只对当前项目生效，不需要 sudo）：
#      curl -fsSL https://raw.githubusercontent.com/ice5kysl/live-video/main/install.sh | bash
#
#  装到全局（所有项目都能用）：
#      curl -fsSL https://raw.githubusercontent.com/ice5kysl/live-video/main/install.sh | bash -s -- --user
#
#  也可以本地跑：
#      bash install.sh [--user] [--dir <harness/skills 目录>]
# =============================================================================
set -euo pipefail

REPO_HTTPS="https://github.com/ice5kysl/live-video.git"
REPO_TARBALL="https://github.com/ice5kysl/live-video/archive/refs/heads/main.tar.gz"
NAME="live-video"
SCOPE="project"
CUSTOM=""

while [ $# -gt 0 ]; do
  case "$1" in
    --user|-g)  SCOPE="user"; shift ;;
    --project|-p) SCOPE="project"; shift ;;
    --dir|-d)   CUSTOM="$2"; shift 2 ;;
    -h|--help)  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

say() { printf "  %s\n" "$1"; }
die() { printf "  ✗ %s\n" "$1" >&2; exit 1; }

# ---- 目标目录 ----
if [ -n "$CUSTOM" ]; then
  TARGET="$CUSTOM/$NAME"
elif [ "$SCOPE" = "user" ]; then
  TARGET="$HOME/.agents/skills/$NAME"
else
  TARGET="$(pwd)/.agents/skills/$NAME"
fi

echo "▸ 安装 Live-Video"
say "目标: $TARGET"

# ---- 取源码：优先 git，其次 tarball ----
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if command -v git >/dev/null 2>&1; then
  say "从 GitHub 克隆…"
  git clone --depth 1 -q "$REPO_HTTPS" "$TMP/src" || die "克隆失败，检查网络或改用 tarball 方式"
elif command -v curl >/dev/null 2>&1; then
  say "下载源码包…"
  curl -fsSL "$REPO_TARBALL" -o "$TMP/src.tar.gz" || die "下载失败"
  mkdir -p "$TMP/src" && tar -xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components=1
else
  die "需要 git 或 curl 之一，请先安装"
fi

# ---- 落位 ----
mkdir -p "$(dirname "$TARGET")"
[ -e "$TARGET" ] && { say "已存在，先移除旧版本"; rm -rf "$TARGET"; }
cp -R "$TMP/src" "$TARGET"
rm -rf "$TARGET/.git" "$TARGET"/scripts/__pycache__ 2>/dev/null || true
chmod +x "$TARGET"/scripts/*.sh "$TARGET"/bin/*.js 2>/dev/null || true
say "✓ 已安装"

# ---- 自检 ----
echo
if command -v bash >/dev/null 2>&1; then
  bash "$TARGET/scripts/check-env.sh" || true
fi

echo
echo "✓ 完成"
case "$SCOPE" in
  project) say "已装到当前项目 —— 只在本项目内可用，且会随项目一起提交（如需共享给同事）" ;;
  user)    say "已装到 ~/.agents/skills —— 本机所有项目都能用" ;;
esac
say "重开一个会话，让 agent 重新加载技能列表；之后直接说「用 live-video 做个视频」即可"
echo
echo "  装 edge-tts（免密钥、音质好，推荐做一次）："
echo "    python3 \"$TARGET/scripts/synth.py\" --setup-edge"
