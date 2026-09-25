#!/usr/bin/env bash
# =============================================================================
#  一键出片：把逐幕 HTML 页面录成带配音和字幕的 mp4
#
#  用法:  HTML=页面.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh [fps]
#
#  环境变量：
#    TTS_PROVIDER  auto(默认) | tencent | edge | say     语音合成 provider
#    TTS_ENV       TTS 凭证 .env 路径（仅 tencent 需要）
#    VOICE         音色；不指定则用该 provider 的默认音色
#    SPEED         语速；0 为基准（各 provider 口径不同）
#    SILENT=1      跳过 TTS，按幕时长生成静音轨（无凭证时跑通链路用）
#    STRICT=1      旁白装不下时报错退出（默认自动延长该幕时长）
#    CHROME_BIN    浏览器可执行文件路径
#
#  依赖: ffmpeg(含 libx264) / node>=22 / python3 / Chrome
#        先跑 bash build/check-env.sh 自检
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

FPS="${1:-25}"
HTML="${HTML:-演示页-视频版.html}"
OUT="${OUT:-安监-从流程合规到本质安全.mp4}"
A="build/audio"
mkdir -p "$A"

echo "▸ 1/6  解析时间轴"
python3 - <<'PY'
import re, json, os
import os
s = open(os.environ.get("HTML","演示页-视频版.html"), encoding="utf-8").read()
# 逐幕取语音文本：有 data-say（读法覆盖）则用它，否则用 data-vo。
# 必须「逐幕」对齐 —— 不能用 (say + vo) 拼接，那样会整体错位。
blocks = re.findall(r'<section class="scene.*?</section>', s, re.S)
vo = []
for b in blocks:
    m = re.search(r'data-say="([^"]*)"', b) or re.search(r'data-vo="([^"]*)"', b)
    vo.append(m.group(1) if m else '')
n_say = sum(1 for b in blocks if 'data-say=' in b)
du = [float(x) for x in re.findall(r'data-dur="([\d.]+)"', s)]
assert len(blocks) == len(du), ('幕数不一致', len(blocks), len(du))
# 幕数下限放宽到 1（原先写死 >=6，导致幕数少的片段无法单独渲染）；
# 真正的解析校验由上面的 len(blocks) == len(du) 保障
assert len(vo) == len(du) >= 1, (len(vo), len(du))
starts, acc = [], 0.0
for d in du:
    starts.append(round(acc, 3)); acc = round(acc + d, 3)
assert acc <= 150 + 1e-6, "总时长不得超过 150 秒，当前 %s" % acc
os.makedirs("build/audio", exist_ok=True)
json.dump({"vo": vo, "dur": du, "start": starts, "total": acc},
          open("build/audio/timeline.json", "w"), ensure_ascii=False, indent=1)
print("   %d 幕，合计 %.1f 秒（%d 幕使用读法覆盖）" % (len(du), acc, n_say))
PY

SILENT="${SILENT:-0}"
if [ "$SILENT" = "1" ]; then
  echo "▸ 2/6  生成配音（⚠ SILENT=1：跳过 TTS，按幕时长生成静音轨）"
else
  echo "▸ 2/6  生成配音"
fi
FIT_HTML="$(dirname "$HTML")/$(basename "${HTML%.html}")-fit.html"
export FIT_HTML
python3 - <<'PY'
import json, re, subprocess, sys, os
sys.path.insert(0, "build")
import synth

SILENT = os.environ.get("SILENT") == "1"
SPEED  = float(os.environ.get("SPEED", "0.0"))   # 语速：0 为基准；每档约 ±18%
VOICE  = os.environ.get("VOICE") or None         # 不指定则用该 provider 的默认音色
OFF, TAIL = 0.30, 0.60                           # 每幕开场 / 收尾留白

provider = None
if not SILENT:
    provider = synth.detect()
    if not provider:
        raise SystemExit(synth.provider_hint())
    v = VOICE or synth.DEFAULT_VOICE[provider]
    print("   provider=%s ｜ 音色=%s ｜ 语速=%s" % (provider, v, SPEED))
    if provider != "tencent":
        print("   （各 provider 语速不同：腾讯云最快，edge/say 更慢；装不下的幕会自动延长）")

tl   = json.load(open("build/audio/timeline.json"))
rows = []
for i, (v, st, d) in enumerate(zip(tl["vo"], tl["start"], tl["dur"]), 1):
    wav = "build/audio/s%02d.wav" % i
    if SILENT:
        dur = max(0.1, d - OFF - TAIL)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
                        "-i", "anullsrc=r=44100:cl=mono", "-t", "%.3f" % dur, wav], check=True)
    else:
        dur = synth.synth(v, wav, provider=provider, voice=VOICE, speed=SPEED)
    ok = "OK" if OFF + dur <= d - 0.05 else "!! 越界"
    rows.append((i, st, d, dur, 0, ok))
    print("   S%-2d 幕 %4.1fs / 配音 %5.2fs  余 %4.2fs  %s" % (i, d, dur, d - OFF - dur, ok))
json.dump({"off": OFF, "rows": rows}, open("build/audio/dur.json", "w"))

# ---- 自动适配：旁白装不下就延长该幕 ----
STRICT = os.environ.get("STRICT") == "1"
need   = [round(OFF + r[3] + TAIL + 0.05, 2) for r in rows]   # 每幕所需时长
durs   = [r[2] for r in rows]
over   = [i + 1 for i in range(len(rows)) if need[i] > durs[i] + 1e-6]

if over and STRICT:
    raise SystemExit("配音越界（STRICT=1），请加长这几幕或缩短文案：%s" % over)

if over:
    new_durs = [max(durs[i], need[i]) for i in range(len(rows))]
    src = os.environ.get("HTML", "演示页-视频版.html")
    html = open(src, encoding="utf-8").read()
    it = iter(new_durs)
    html = re.sub(r'data-dur="[\d.]+"',
                  lambda m: 'data-dur="%s"' % next(it, m.group(0)[10:-1]), html)
    fit = os.environ["FIT_HTML"]
    open(fit, "w", encoding="utf-8").write(html)
    # 重算时间轴
    starts, acc = [], 0.0
    for d in new_durs:
        starts.append(round(acc, 3)); acc = round(acc + d, 3)
    json.dump({"vo": tl["vo"], "dur": new_durs, "start": starts, "total": round(acc, 3)},
              open("build/audio/timeline.json", "w"), ensure_ascii=False, indent=1)
    # 混音步骤读的是 dur.json，必须同步更新，否则音轨会比画面短、被 -shortest 截断
    rows = [(r[0], starts[i], new_durs[i], r[3], r[4], r[5]) for i, r in enumerate(rows)]
    json.dump({"off": OFF, "rows": rows}, open("build/audio/dur.json", "w"))
    print("   ⚙ 自动延长了 %d 幕（旁白比原时长长）：%s" % (len(over), over))
    print("     新总长 %.1fs ｜ 适配页面：%s" % (acc, fit))
    print("     （想改成报错而不是自动延长，加 STRICT=1）")
else:
    open(os.environ["FIT_HTML"], "w", encoding="utf-8").write(
        open(os.environ.get("HTML", "演示页-视频版.html"), encoding="utf-8").read())
PY

echo "▸ 3/6  拼接人声轨 + 混音（无底乐）"
python3 - <<'PY'
import json, subprocess, os
A = "build/audio"
rows = json.load(open(A + "/dur.json"))["rows"]
total = json.load(open(A + "/timeline.json"))["total"]
segs = []
for no, st, d, dur, _, _ in rows:
    off  = min(0.30, max(0.18, d - dur - 0.15))
    tail = max(0.05, d - off - dur)
    a, b = "%s/sil_a%02d.wav" % (A, no), "%s/sil_b%02d.wav" % (A, no)
    for f, t in ((a, off), (b, tail)):
        subprocess.run(["ffmpeg","-y","-v","error","-f","lavfi","-i","anullsrc=r=44100:cl=mono",
                        "-t","%.3f"%t,"-c:a","pcm_s16le",f], check=True)
    segs += [a, "%s/s%02d.wav" % (A, no), b]
open(A + "/concat.txt", "w").write("".join("file '%s'\n" % os.path.abspath(x) for x in segs))
subprocess.run(["ffmpeg","-y","-v","error","-f","concat","-safe","0","-i",A+"/concat.txt",
                "-c:a","pcm_s16le","-ar","44100","-ac","1",A+"/voice.wav"], check=True)
print("   总长 %.1f 秒" % total)
PY
TOTAL=$(python3 -c "import json;print('%.3f'%json.load(open('build/audio/timeline.json'))['total'])")
# 说明：不再叠加氛围底乐。
# 早期版本用 sine 110 / 164.81 / 220 / 261.63 四路叠加做铺底，
# 其中 110Hz 与 164.81Hz 属低频，经 lowpass=760 后留下明显的「嗡嗡」声。
# 现只保留人声（如需底乐，应换用不含低频持续音的音源）。
ffmpeg -y -v error -i "$A/voice.wav" \
 -filter_complex "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.97[a]" \
 -map "[a]" -ar 44100 -ac 2 -c:a pcm_s16le "$A/mix.wav"

echo "▸ 4/6  逐帧抓取（1920×1080 @ ${FPS}fps × ${TOTAL}s）"
rm -rf build/frames
node build/capture.js "$FIT_HTML" build/frames "$FPS" "$TOTAL" jpeg

echo "▸ 5/6  生成字幕 SRT"
python3 - <<'PY'
import json, re
tl = json.load(open("build/audio/timeline.json"))
import os
s = open(os.environ.get("HTML","演示页-视频版.html"), encoding="utf-8").read()
subs   = re.findall(r'data-sub="([^"]*)"', s)
blocks = re.findall(r'<section class="scene.*?</section>', s, re.S)
def ts(t):
    h = int(t // 3600); m = int((t % 3600) // 60); sec = t % 60
    return "%02d:%02d:%02d,%03d" % (h, m, int(sec), round((sec - int(sec)) * 1000))
out, n = [], 0
for st, d, blk, full in zip(tl["start"], tl["dur"], blocks, subs):
    m = re.search(r'data-subs="([^"]*)"', blk)
    if m:
        # 幕内分段字幕：一条幕拆成多条，时间按幕内偏移
        marks = []
        for x in m.group(1).split(';;'):
            if '|' in x:
                q = x.index('|'); marks.append((float(x[:q]), x[q+1:]))
        for i, (off, txt) in enumerate(marks):
            end = marks[i+1][0] if i+1 < len(marks) else d
            n += 1
            out.append("%d\n%s --> %s\n%s\n" % (n, ts(st + off), ts(st + end - 0.05), txt))
    else:
        n += 1
        out.append("%d\n%s --> %s\n%s\n" % (n, ts(st + 0.12), ts(st + d - 0.05), full))
open(os.environ.get("SRT", "安监-字幕.srt"), "w", encoding="utf-8").write("\n".join(out))
print("   %d 条字幕" % n)
PY

echo "▸ 6/6  编码 H.264 + AAC"
FO=$(python3 -c "print(max(0,$TOTAL-1.3))")
ffmpeg -y -hide_banner -loglevel error \
 -framerate "$FPS" -i "build/frames/f%05d.jpg" -i "$A/mix.wav" \
 -filter_complex "[0:v]fade=t=in:st=0:d=0.9:color=white,fade=t=out:st=$FO:d=1.4:color=white,format=yuv420p[v]" \
 -map "[v]" -map 1:a \
 -c:v libx264 -preset "${PRESET:-slow}" -crf "${CRF:-18}" -profile:v high -level 4.1 -pix_fmt yuv420p \
 -c:a aac -b:a 192k -ar 44100 -ac 2 -shortest -movflags +faststart "$OUT"

rm -rf build/frames build/audio/sil_*.wav build/audio/*.aiff build/audio/concat.txt
echo "✓ 完成：$OUT"
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$OUT"
