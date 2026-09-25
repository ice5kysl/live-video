---
name: live-video
description: |
  把 HTML 页面做成「汇报级演示视频」—— 用网页当画面、TTS 当旁白、无头浏览器逐帧截图当录屏，全程脚本化，
  改一句台词改一行代码就能重出。产出 H.264/AAC 的 mp4（含字幕 / 无字幕 / 1.2 倍速多种版本）。

  适用场景：方案汇报插片、产品演示、概念讲解、流程/数据看板讲解等，以「讲解 + 图示」为主的短片（30 秒 ~ 3 分钟）。

  当用户提到以下任何情况时使用本 skill：
  「做演示视频」「做汇报视频」「出片」「HTML 转视频」「网页录成视频」「给 PPT 配一段视频」
  「加旁白」「加字幕」「改台词重出」「视频太长了压缩一下」「做个 1 分钟的介绍视频」
  「demo video」「explainer video」「narrated video」「turn HTML into video」「screen-record my page to video」
  以及：用户已有一份逐幕的文案/分镜，想把它变成带配音和字幕的视频。

  不适用：实拍素材剪辑、真人出镜、复杂三维动画、纯剪辑拼接已有视频（那类请用剪辑软件）。
metadata:
  version: "1.0.0"
---

# 演示视频制作

把 HTML 页面做成演示视频。**页面负责「长什么样」，脚本负责「什么时候说什么、画面走到哪一帧」。**

## 适用判断

| 情况 | 用本 skill |
|---|---|
| 有逐幕文案 / 分镜，要做成带配音和字幕的短片 | ✅ |
| 已有 HTML 页面 / 图表 / 看板，想录成视频 | ✅ |
| 内容常改，希望改一句就能重出 | ✅ |
| 需要旁白与画面逐句对齐 | ✅ |
| 实拍、真人出镜、复杂特效 | ❌ 用剪辑软件 |
| 纯拼接已有视频片段 | ❌ 用 ffmpeg 直接 concat |

---

## 一、先跑环境自检

**任何操作之前，先执行：**

```bash
bash scripts/check-env.sh
```

它会检查 ffmpeg(含 libx264)、node ≥ 22、python3、Chrome 是否就绪，以及 TTS 凭证是否配置。
缺什么会直接给出安装命令。**不要跳过这一步** —— 否则会在出片跑到一半时才失败。

---

## 二、三条硬约束（违反任何一条，录屏一定对不上）

### 1. 入场动画只能用 CSS animation

```html
<div class="au" style="--d:0.72s">内容</div>
```
```css
.scene.play .au { animation: au .78s both; animation-delay: var(--d, 0s); }
```

录屏引擎 `__seek(t)` 靠「暂停动画 + 设 currentTime」逐帧定位。
**`setTimeout` / `requestAnimationFrame` / `<video>` 都无法被定位**，录出来会闪或停在错误状态。

### 2. 动画门控选择器必须写复合形式

```css
.scene.play .v1s2 .card { }   /* ❌ 被解析成「后代」，不生效 */
.scene.play.v1s2 .card { }    /* ✅ 同一个元素上的多个类 */
```

### 3. `curIdx` 必须初始化为 `-1`

```js
var curIdx = -1;   // 写成 0 → 第一幕永远空白（只有第一幕有问题，极易误判）
```

另有两条同样重要：**图标一律内嵌 SVG，禁止 emoji**；**CSS 写成独立文件，不要塞进 Python f-string 模板**。

---

## 三、起一个新项目

### 1. 建目录

```bash
mkdir -p 我的视频/build/{frames,audio}
cp <skill>/scripts/* 我的视频/build/
cp <skill>/templates/演示页-模板.html 我的视频/演示页.html
```

`make.sh` 假定：**脚本在 `build/`，页面在上一层**。

### 2. 写页面

照 `templates/演示页-模板.html` 改。每一幕是一个 `<section class="scene">`：

```html
<section class="scene active v1s1"
  data-dur="9.3"                     <!-- 这一幕总时长（秒）-->
  data-vo="要被念出来的旁白"           <!-- 送 TTS -->
  data-sub="烧入画面的字幕"            <!-- 通常与 data-vo 相同 -->
  data-subs="0.30|第一句;;3.50|第二句">  <!-- 可选：幕内分段字幕 -->
  <div class="wrap">…画面…</div>
</section>
```

**时长公式**：`data-dur = 0.30 + TTS时长 + 0.60`

### 3. 先量时长，再填 `data-dur`

不要估。逐幕单独合成一次量出真实秒数：

```bash
cd 我的视频 && python3 - <<'PY'
import sys, re, io, subprocess
sys.path.insert(0, 'build')
from tencent_tts import tts, load_env
env = load_env()
html = io.open('演示页.html', encoding='utf-8').read()
for i, b in enumerate(re.findall(r'<section class="scene.*?</section>', html, re.S), 1):
    vo = re.search(r'data-vo="([^"]*)"', b).group(1)
    d, _ = tts(vo, "502005", speed=0.0, env=env)
    open('/tmp/_m.mp3','wb').write(d)
    dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
                                "-of","csv=p=0","/tmp/_m.mp3"], capture_output=True, text=True).stdout)
    print('幕%02d  →  data-dur="%.1f"' % (i, dur + 0.9))
PY
```

**语速参考**（腾讯云 502005 解说男声）：Speed 0 ≈ **5.3 字/秒**；Speed −1 ≈ 4.3；Speed 1 ≈ 6.6

### 4. 出片

```bash
cd 我的视频
node build/stills.js 演示页.html /tmp/check "3,8,15"        # 先抓静帧核对画面
HTML=演示页.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh
```

---

## 四、语音合成（三档 provider，自动选择）

**默认 `TTS_PROVIDER=auto`**，按可用性依次尝试，**选到哪个会明确打印出来**：

| provider | 要密钥 | 依赖 | 音质 | 适合 |
|---|---|---|---|---|
| `tencent` | ✅ 需要 | 无（纯标准库） | **最好** | 正式交付 |
| `edge` | ❌ **免密钥** | 一键自建 venv（不动系统 Python）| 好 | **推荐默认** |
| `say` | ❌ **免密钥** | 无（macOS 自带） | 一般 | **零配置兜底** |

```bash
# 首次使用：装上 edge-tts（免密钥、音质好）—— 会自动建独立 venv
python3 scripts/synth.py --setup-edge

# 直接用（自动挑一个可用的）
HTML=页面.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh

# 强制指定
TTS_PROVIDER=edge    ...
TTS_PROVIDER=say     ...
TTS_PROVIDER=tencent TTS_ENV=~/.config/live-video/.env ...

# 指定音色与语速
VOICE=zh-CN-YunxiNeural SPEED=0 ...
```

**各 provider 的推荐音色**（`scripts/synth.py` 里的 `VOICES`）：

| 角色 | tencent | edge | say |
|---|---|---|---|
| 解说男声 | `502005` | `zh-CN-YunxiNeural` | `Tingting` |
| 解说女声 | `502003` | `zh-CN-XiaoxiaoNeural` | `Tingting` |
| 沉稳男声 | `603006` | `zh-CN-YunjianNeural` | `Tingting` |
| 年轻女声 | `603007` | `zh-CN-XiaoyiNeural` | `Tingting` |

### ⚠ 各 provider 语速不同，但不用手工重校

同一句话实测：**腾讯云 3.49s ｜ edge 5.26s ｜ say 5.16s** —— 腾讯云明显更快。

**make.sh 会自动处理**：某幕旁白装不下时，**自动延长该幕时长**，并生成一个 `*-fit.html` 用于录屏
（**不改你的源文件**）。日志会打印延长了哪几幕、新总长是多少。

想改成"报错而不是自动延长"：加 `STRICT=1`。

### 配置腾讯云凭证（可选）

```bash
mkdir -p ~/.config/live-video
cat > ~/.config/live-video/.env <<'EOF'
TENCENT_SECRET_ID=xxx
TENCENT_SECRET_KEY=xxx
EOF
```
（控制台建「子账号」并**只授予语音合成权限**，不要用主账号密钥）

### 完全不要配音

```bash
SILENT=1 HTML=页面.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh
```
按幕时长生成静音轨 —— 用于验证链路，不是能交付的成品。

---

## 五、常用命令

```bash
# 抓静帧核对画面（改图后最常用）
node build/stills.js 演示页.html /tmp/check "3,8,15,22"

# 出片
HTML=演示页.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh

# 无字幕版：先生成去字幕副本
python3 -c "
import io; s=io.open('演示页.html',encoding='utf-8').read()
io.open('演示页-无字幕.html','w',encoding='utf-8').write(
  s.replace('</head>','<style>#vsub{display:none !important}</style></head>',1))"
HTML=演示页-无字幕.html OUT=成片-无字幕.mp4 SRT=/tmp/x.srt bash build/make.sh

# 派生 1.2 倍速（音高不变；字幕时间轴记得同步除以 1.2）
ffmpeg -i 成片.mp4 -filter_complex "[0:v]setpts=PTS/1.2[v];[0:a]atempo=1.2[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart 成片_语速1.2倍.mp4

# 音量验收（基线：mean ≈ −20dB，max ≥ −5dB）
ffmpeg -i build/audio/mix.wav -af volumedetect -f null /dev/null 2>&1 | grep volume
```

**插入/替换某一段**：A、B 分段分别渲染，与素材 C 直接 `-c copy` 拼接（三段必须同码同帧率）——
**不要**整片渲完再从中间切开（切点不准，或要二次编码）。

---

## 六、出片前自检

- [ ] 每一幕都抽帧看过（`stills.js`）
- [ ] **正文底部没有被字幕条压住**（字幕条固定在底部，排太满会挡住——只有出片才发现）
- [ ] 首尾淡入淡出正常
- [ ] 音量达标
- [ ] 字幕与旁白逐句对得上（抽 3 处）
- [ ] 交付包内容与工作区一致（**改完要同步，且要验证交付包里的文件，不能拿工作区结果冒充**）

---

## 七、完整规范

改画面、调时长、压缩、选音色、排查疑难问题，见：

- **`references/制作标准.md`** —— 完整标准：技术链路、页面规范、配音/录屏/字幕/编码规范、
  目录命名、**18 条踩坑清单**、节奏经验值。**遇到任何非预期现象先查它的第十章。**
- **`references/工具包说明.md`** —— 各脚本的作用与参数

排查问题时优先看踩坑清单，前 6 条是致命的：

| # | 坑 | 后果 |
|---|---|---|
| 1 | 入场动画用 JS 定时器 | 录屏完全对不上 |
| 2 | 门控选择器写三层 | 动画永不触发 |
| 3 | emoji 当图标 | 跨系统渲染不一致 |
| 4 | CSS 塞进 Python f-string | `NameError` |
| 5 | 渲染失败被 `\|\| true` 吞掉 | 交付残缺视频 |
| 6 | `curIdx = 0` | 第一幕永远空白 |

---

## 八、目录约定

正式交付按「一支片子一个文件夹」：

```
<片名>/
├── 00_交付说明.md
├── 01_视频/          成片（含字幕/无字幕 × 1.0x/1.2x）
├── 02_脚本/          口播稿 + 分镜预览
├── 03_字幕/          外挂 SRT
├── 04_源文件/        单文件 HTML + build/
└── 05_配音/          整片音轨 + 分段音频
```

**新版本一律另存，不覆盖旧版本**（V1 → V2 → V3 全部保留，随时可对比回退）。
