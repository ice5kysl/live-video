# 各 harness 安装指引

> **一句话结论：Live-Video 不挑 harness，谁都能用。**
> 因为它是**纯脚本**（shell / node / python），不调用任何 agent 专有 API；
> `SKILL.md` 也只依赖各家都认的最小 frontmatter 字段。

本文档解决的是「**怎么让某个 harness 发现它**」—— 因为各家的 skill 目录是**各自独立**的。

---

## 一、为什么哪个 harness 都能用

### 1. 技能本体没有 harness 依赖

| 能力 | 实现 | 依赖 |
|---|---|---|
| 网页录屏 | `capture.js` / `stills.js`（CDP 连 Chrome）| 只要 node ≥ 22 + Chrome |
| 语音合成 | `synth.py`（腾讯云 / edge-tts / macOS say）| 只要 python3 |
| 合成出片 | `make.sh`（ffmpeg）| 只要 ffmpeg |
| 页面 | 纯 HTML + CSS | 浏览器 |

**没有一行代码跟具体 harness 有关。**

### 2. SKILL.md 的格式是各家公共交集

实测这台机器上 6 家 harness 的 frontmatter 字段：

| harness | 识别到的字段 |
|---|---|
| Claude Code | `name` `version` `description` |
| Kimi Code | `name` `description` `metadata` |
| Codex | `name` `description` `metadata` |
| Qwen Code | `name` `description` `version` |
| Cursor | `name` `description` `license` `metadata` |
| Qoder | `name` `description` `license` `metadata` |

**公共必需字段只有 `name` + `description`** —— Live-Video 用的就是这两个（外加可选的 `metadata`）。

**旁证**：本机 `kimi-webbridge` 这个 skill 同时装在 4 家 harness 里，`SKILL.md` 的 md5 **完全一致**（`56115f4c`）——
说明同一个 skill 文件可以原样跨 harness 使用。

---

## 二、各 harness 的 skill 目录

**注意：以你这台机器的实际情况为准**（下一节教你怎么探测）。

### 常见位置（用户级）

| harness | skill 目录 |
|---|---|
| **dsh** | `~/.agents/skills/`（可用 `DSH_AGENTS_HOME` 覆盖）；也扫 `~/.dsh/skills/` |
| **Claude Code** | `~/.claude/skills/` |
| **Kimi Code** | `~/.kimi-code/skills/`（旧版 `~/.kimi/skills/`）|
| **Codex** | `~/.codex/skills/` |
| **Qwen Code** | `~/.qwen/skills/` |
| **Cursor** | `~/.cursor/skills/` |
| **Qoder** | `~/.qoder/skills/` |
| **Trae** | `~/.trae/skills/`、`~/.trae-cn/skills/` |
| **OpenCode** | `~/.config/opencode/skills/` |

### 项目级（部分 harness 支持）

有的 harness 还扫**项目目录下**的 skills，例如项目根的 `.claude/skills/`、`.agents/skills/`。
**同一个 skill 想让某个项目专用**时用这个。

### 共享中枢的做法

本机采用的模式：**源码放一个仓库，各家目录里放软链**。

```
~/Documents/codes/skills/Live-Video/          ← 源码（git 仓库）
        ↑
        ├── ~/.agents/skills/live-video       ← dsh 读
        └── ~/.claude/skills/live-video       ← Claude Code 读
```

好处：**改源码，所有 harness 同时生效**；不用拷多份、不会版本不一致。

---

## 三、先探测你这台机器的目录

**别照抄上面的表** —— 你的 harness 组合、安装位置可能不同。跑这段：

```bash
# 找出本机所有 harness 的 skills 目录
for d in ~/.agents ~/.dsh ~/.claude ~/.kimi-code ~/.kimi ~/.codex ~/.qwen \
         ~/.cursor ~/.qoder ~/.trae ~/.trae-cn ~/.config/opencode \
         ~/.gemini ~/.iflow ~/.kimi_openclaw/workspace; do
  [ -d "$d/skills" ] && printf "%-40s %s 项\n" "$d/skills" "$(ls "$d/skills" 2>/dev/null | wc -l | tr -d ' ')"
done

# 更彻底：全盘搜名为 skills 的目录（跳过无关的）
find ~ -maxdepth 4 -type d -name skills 2>/dev/null | grep -v Library | sort
```

看到某个目录里**已经有别的 skill**，那就是你要放软链的地方。

---

## 四、安装（三种方式，任选）

### 方式 A：软链（**推荐** —— 源码改动立刻生效）

```bash
# 1) 拿到源码
git clone https://github.com/ice5kysl/live-video.git ~/Documents/codes/skills/Live-Video

# 2) 给每个你要用的 harness 建软链（把 <DIR> 换成第三节探测到的目录）
for DIR in ~/.agents/skills ~/.claude/skills ~/.kimi-code/skills ~/.codex/skills \
           ~/.qwen/skills ~/.cursor/skills ~/.qoder/skills; do
  [ -d "$DIR" ] && ln -sfn ~/Documents/codes/skills/Live-Video "$DIR/live-video" && echo "✓ $DIR"
done
```

> `ln -sfn` 的 `-n` 很重要：目标已是软链时直接替换，不会套娃。

### 方式 B：npm（会自带一个 link 命令帮你软链）

```bash
npm i @ice5kysl/live-video
npx @ice5kysl/live-video link        # 自动探测并软链到本机所有 harness
```

### 方式 C：skills CLI

```bash
npx skills add ice5kysl/live-video
```

### 方式 D：直接拷贝（最简单，但**改源码后各份不会同步**）

```bash
cp -R Live-Video ~/.claude/skills/live-video
```

---

## 五、验证装好了没

```bash
# ① 目录在不在
ls -la ~/.claude/skills/live-video/SKILL.md

# ② 环境依赖过不过
bash ~/.claude/skills/live-video/scripts/check-env.sh

# ③ 实际出一小段（最快验证整条链路）
T=/tmp/lv-check; rm -rf $T; mkdir -p $T/build
cp ~/.claude/skills/live-video/scripts/* $T/build/
cp ~/.claude/skills/live-video/templates/演示页-模板.html $T/页.html
cd $T && node build/stills.js 页.html /tmp/lv-out "3,10"
ls /tmp/lv-out     # 出现 jpg 就说明录屏链路通了
```

**harness 侧确认**：新开一个会话，问它「有哪些 skill 可用」或直接说「用 live-video 做个视频」，
看它能否加载到（能报出 skill 内容就说明被发现了）。

---

## 六、排查

| 现象 | 原因 | 处理 |
|---|---|---|
| harness 说找不到这个 skill | 它的 skills 目录里没有 | 按第三节探测，建软链 |
| 装了但 harness 不认 | 目录名与 `name:` 字段不一致，或层级不对 | 确保是 `<skills目录>/live-video/SKILL.md` |
| 软链建了不生效 | 目标路径写错 / 相对路径 | 用**绝对路径**；`ls -la` 看软链是否有效 |
| 改了源码别的 harness 没变 | 用的是「拷贝」不是「软链」 | 改成软链，或重新拷贝 |
| `check-env.sh` 报缺 ffmpeg | 没装或装的版本缺 libx264 | 见 SKILL.md 的依赖表 |
| edge/tencent 都不可用 | 没装 edge-tts 且无腾讯云凭证 | `python3 scripts/synth.py --setup-edge` |

---

## 七、注意事项

1. **目录名建议用 `live-video`**（跟 `name:` 字段、仓库名一致）—— 有些 harness 靠目录名匹配。
2. **团队协作时用软链，别各自拷贝** —— 否则一人改一处，版本很快发散。
3. **运行时资产在技能之外**，不随技能拷贝：
   - edge-tts 的 venv：`~/.local/share/live-video/venv`（19 MB，平台相关，**不要进仓库**）
   - 腾讯云凭证：`~/.config/live-video/.env`
   换机器后重跑一次 `python3 scripts/synth.py --setup-edge` 即可。
4. **公司内网 GitLab 的仓库，公网 harness 装不了** —— 外部共享需要另外推一份到公网仓库。
5. 本机若装了**十几个 harness**，不必全软链 —— 只给你实际会用的那几个建即可。
