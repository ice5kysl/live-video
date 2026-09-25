# Live-Video

把 **HTML 页面**做成**汇报级演示视频**的 Agent Skill。

> 页面负责「长什么样」，脚本负责「什么时候说什么、画面走到哪一帧」。

用网页当画面、TTS 当旁白、无头浏览器逐帧截图当录屏，**全程脚本化** ——
改一句台词改一行代码就能重出，产出 H.264/AAC 的 mp4（含字幕 / 无字幕 / 1.2 倍速多种版本）。

## 适用场景

| 情况 | 用本 skill |
|---|---|
| 有逐幕文案 / 分镜，要做成带配音和字幕的短片 | ✅ |
| 已有 HTML 页面 / 图表 / 看板，想录成视频 | ✅ |
| 内容常改，希望改一句就能重出 | ✅ |
| 需要旁白与画面逐句对齐 | ✅ |
| 实拍、真人出镜、复杂特效 | ❌ 用剪辑软件 |
| 纯拼接已有视频片段 | ❌ 直接 ffmpeg concat |

典型产出：方案汇报插片、产品演示、概念讲解、流程/数据看板讲解等，
以「讲解 + 图示」为主的短片（**30 秒 ~ 3 分钟**）。

## 安装

**本 skill 不挑 harness** —— dsh / Claude Code / Kimi Code / Codex / Cursor / Qwen / Qoder / Trae / OpenCode
都能用。技能本体是纯脚本，`SKILL.md` 只依赖各家都认的 `name` + `description`。

但**各家的 skill 目录是各自独立的**，需要在你要用的那家目录里放一份（推荐软链）：

```bash
# 1) 拿源码
git clone <仓库地址> ~/Documents/codes/skills/Live-Video

# 2) 给每个要用的 harness 建软链（-n 避免套娃）
for DIR in ~/.agents/skills ~/.claude/skills ~/.kimi-code/skills ~/.codex/skills \
           ~/.qwen/skills ~/.cursor/skills ~/.qoder/skills; do
  [ -d "$DIR" ] && ln -sfn ~/Documents/codes/skills/Live-Video "$DIR/live-video" && echo "✓ $DIR"
done

# 3) 或者用 skills CLI
npx skills add <仓库地址>
```

> **同事的环境布局可能不同** —— 先探测再装。
> 详见 **[references/各harness安装指引.md](./references/各harness安装指引.md)**：
> 探测脚本、三种安装方式、验证步骤、排查表。

## 环境依赖

```bash
bash scripts/check-env.sh     # 一把梭自检，缺什么给什么安装命令
```

| 依赖 | 要求 | 说明 |
|---|---|---|
| ffmpeg | 含 **libx264** + aac | 不需要 libass（字幕烧在页面里）|
| node | **≥ 22** | 自带 WebSocket，CDP 录屏依赖 |
| python3 | ≥ 3.8 | |
| Chrome | 任意版本 | 自动探测各平台常见位置，也可用 `CHROME_BIN` 指定 |

## 语音合成（三档 provider，自动选择）

| provider | 需要密钥 | 依赖 | 音质 |
|---|---|---|---|
| `tencent` | ✅ | 无（纯标准库） | 最好 |
| `edge` | ❌ **免密钥** | 一键自建 venv | 好（**推荐**）|
| `say` | ❌ **免密钥** | 无（macOS 自带） | 一般（零配置兜底）|

```bash
# 首次使用：装上 edge-tts（免密钥、音质好，不动系统 Python）
python3 scripts/synth.py --setup-edge

# 之后直接用，会自动挑一个可用的
HTML=页面.html OUT=成片.mp4 SRT=字幕.srt bash scripts/make.sh
```

## 快速开始

```bash
mkdir -p 我的视频/build/{frames,audio}
cp scripts/* 我的视频/build/
cp templates/演示页-模板.html 我的视频/演示页.html
cd 我的视频
node build/stills.js 演示页.html /tmp/check "3,8,15"     # 抓静帧看画面
HTML=演示页.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh
```

完整规范见 [`SKILL.md`](./SKILL.md) 与 [`references/制作标准.md`](./references/制作标准.md)。

## 目录

```
Live-Video/
├── SKILL.md                    入口：适用判断 / 硬约束 / 流程 / 命令
├── manifest.json               元数据与环境变量
├── scripts/                    全部脚本
│   ├── make.sh                 出片主入口
│   ├── capture.js              录屏（CDP 逐帧截图）
│   ├── stills.js               抓静帧（改图核对用）
│   ├── shot_static.js          静态页整页截图
│   ├── synth.py                语音合成（多 provider）
│   ├── tencent_tts.py          腾讯云 TTS 底层实现
│   ├── __chrome.js             跨平台浏览器探测
│   ├── check-env.sh            环境自检
│   └── base.css                基础骨架样式
├── templates/
│   └── 演示页-模板.html         最小可运行模板（3 幕）
└── references/
    ├── 制作标准.md             完整标准 + 18 条踩坑清单
    ├── 各harness安装指引.md    跨 harness 安装 / 探测 / 验证 / 排查
    └── 工具包说明.md           各脚本的作用与参数
```

## 三条硬约束

违反任何一条，录屏一定对不上：

1. **入场动画只能用 CSS `animation` + `animation-delay: var(--d)`** —— 禁用 JS 定时器
2. **动画门控选择器必须写复合形式** `.scene.play.v1s2`（同一个元素上的多个类）
3. **`curIdx` 必须初始化为 `-1`** —— 写成 `0` 会让第一幕永远空白

另有两条同样重要：图标一律内嵌 **SVG**（禁止 emoji）；CSS 写成**独立文件**（不要塞进 Python f-string 模板）。

更多坑见 `references/制作标准.md` 第十章（18 条，前 6 条是致命的）。

---

## 外发前检查

本 skill 已做过脱敏审计，**不含任何密钥、凭证、个人信息或真实业务数据**。
若要发布到**公司外部**（公网仓库 / 交给外部团队），只需确认两件事：

1. **仓库地址** —— 本文档里用的是占位符 `<仓库地址>`，替换成你的公网仓库地址即可
2. **依赖的第三方服务** —— 腾讯云 TTS 需要使用者**自己申请子账号密钥**（不要共用）；
   免密钥的 `edge-tts` 与 macOS `say` 无此问题

> 技能本体是纯脚本，**运行时不回传任何数据**：录屏在本机 Chrome 里完成，
> 配音只调用使用者自己配置的 TTS 服务。
