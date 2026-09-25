#!/usr/bin/env node
/**
 * Live-Video CLI —— 只是安装/自检的入口。
 * 真正的出片流程由 SKILL.md 描述、由 scripts/ 下的脚本执行。
 *
 *   npx @ice5kysl/live-video              查看用法与技能位置
 *   npx @ice5kysl/live-video check        跑环境自检（ffmpeg / node / Chrome / TTS）
 *   npx @ice5kysl/live-video link --project  复制到「当前项目」的 .agents/skills/（推荐，不需要权限）
 *   npx @ice5kysl/live-video link --global   软链到本机所有 harness（需要写家目录权限）
 *   npx @ice5kysl/live-video link <目录…>    装到指定目录
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'live-video';
const cmd = process.argv[2] || 'help';

const HARNESS_DIRS = [
  '.agents/skills', '.dsh/skills', '.claude/skills', '.kimi-code/skills', '.kimi/skills',
  '.codex/skills', '.qwen/skills', '.cursor/skills', '.qoder/skills',
  '.trae/skills', '.trae-cn/skills', '.config/opencode/skills',
];

function help() {
  console.log(`
  Live-Video —— 把 HTML 页面做成汇报级演示视频的 Agent Skill

  技能位置: ${ROOT}

  用法:
    npx @ice5kysl/live-video              显示本帮助
    npx @ice5kysl/live-video check        环境自检
    npx @ice5kysl/live-video link --project  复制到当前项目的 .agents/skills/（推荐）
    npx @ice5kysl/live-video link --global   软链到本机所有 harness（需要家目录权限）
    npx @ice5kysl/live-video link <目录…>    装到指定目录

  出片流程（由 AI agent 按 SKILL.md 执行）:
    1. 建项目目录，把 ${NAME}/scripts/* 拷进 build/
    2. 写逐幕 HTML 页面（参考 ${NAME}/templates/演示页-模板.html）
    3. 量出每幕旁白时长，回填 data-dur
    4. HTML=页面.html OUT=成片.mp4 SRT=字幕.srt bash build/make.sh

  详细文档: ${ROOT}/SKILL.md
            ${ROOT}/references/制作标准.md
`);
}

function check() {
  const sh = path.join(ROOT, 'scripts', 'check-env.sh');
  const r = spawnSync('bash', [sh], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function link() {
  const args = process.argv.slice(3);
  const wantGlobal = args.includes('--global') || args.includes('-g');
  const wantProject = args.includes('--project') || args.includes('-p');
  const explicit = args.filter(a => !a.startsWith('-'));

  // ① 显式目录：复制进去（自包含，不依赖源目录还在）
  if (explicit.length) {
    let ok = 0;
    for (const dir of explicit) {
      const target = path.join(path.resolve(dir), NAME);
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.rmSync(target, { recursive: true, force: true });
        copyDir(ROOT, target);
        console.log(`  ✓ ${target}（已复制）`);
        ok++;
      } catch (e) { console.error(`  ✗ ${target} —— ${e.message}`); }
    }
    return done(ok, explicit.length);
  }

  // ② --project（默认）：复制到当前项目的 .agents/skills/
  //    为什么复制而不是软链：node_modules 常被清理，且项目要能提交/备份
  if (wantProject || !wantGlobal) {
    const targets = [path.join(process.cwd(), '.agents/skills', NAME)];
    let ok = 0;
    for (const target of targets) {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.rmSync(target, { recursive: true, force: true });
        copyDir(ROOT, target);
        console.log(`  ✓ ${target}（已复制到当前项目）`);
        ok++;
      } catch (e) { console.error(`  ✗ ${target} —— ${e.message}`); }
    }
    console.log('\n  dsh 会扫描 <项目根>/.agents/skills/，装在这里即可被本项目的会话发现。');
    console.log('  ⚠ 记得重开一个会话，skill 列表是会话启动时加载的。');
    return done(ok, targets.length);
  }

  // ③ --global：软链到本机各 harness（写家目录，可能触发权限审批）
  const home = os.homedir();
  let dirs = HARNESS_DIRS.map(d => path.join(home, d)).filter(d => fs.existsSync(d));
  if (dirs.length === 0) {
    console.error('  未探测到任何 harness 的 skills 目录。请手动指定：');
    console.error('    npx @ice5kysl/live-video link ~/.your-harness/skills');
    process.exit(1);
  }
  console.log(`  探测到 ${dirs.length} 个目录，将建立软链：`);
  let ok = 0;
  for (const dir of dirs) {
    const target = path.join(dir, NAME);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.rmSync(target, { recursive: true, force: true });
      fs.symlinkSync(ROOT, target, 'dir');
      console.log(`  ✓ ${target}`);
      ok++;
    } catch (e) { console.error(`  ✗ ${target} —— ${e.message}`); }
  }
  return done(ok, dirs.length);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '__pycache__' || entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
  try { fs.chmodSync(path.join(dst, 'bin', 'live-video.js'), 0o755); } catch (e) {}
}

function done(ok, total) {
  console.log(`\n  完成 ${ok}/${total}。`);
  if (ok > 0) console.log('  重开一个会话让 agent 重新加载技能列表，然后说「用 live-video 做个视频」。');
}

({ help, check, link, '-h': help, '--help': help }[cmd] || (() => {
  console.error(`  未知命令: ${cmd}\n`);
  help();
  process.exit(1);
}))();
