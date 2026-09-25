#!/usr/bin/env node
/**
 * Live-Video CLI —— 只是安装/自检的入口。
 * 真正的出片流程由 SKILL.md 描述、由 scripts/ 下的脚本执行。
 *
 *   npx @ice5kysl/live-video              查看用法与技能位置
 *   npx @ice5kysl/live-video check        跑环境自检（ffmpeg / node / Chrome / TTS）
 *   npx @ice5kysl/live-video link [目录…]  把技能软链到指定 harness 的 skills 目录
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
    npx @ice5kysl/live-video link [目录…] 软链到 harness 的 skills 目录
                                          不给目录则自动探测本机常见位置

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
  let dirs = process.argv.slice(3);
  if (dirs.length === 0) {
    const home = os.homedir();
    dirs = HARNESS_DIRS
      .map(d => path.join(home, d))
      .filter(d => fs.existsSync(d));
    if (dirs.length === 0) {
      console.error('  未探测到任何 harness 的 skills 目录。请手动指定：');
      console.error('    npx @ice5kysl/live-video link ~/.your-harness/skills');
      process.exit(1);
    }
    console.log(`  探测到 ${dirs.length} 个目录，将建立软链：`);
  }
  let ok = 0;
  for (const dir of dirs) {
    const target = path.join(dir, NAME);
    try {
      fs.mkdirSync(dir, { recursive: true });
      let exists = false;
      try { fs.lstatSync(target); exists = true; } catch (e) {}
      if (exists) fs.rmSync(target, { recursive: true, force: true });
      fs.symlinkSync(ROOT, target, 'dir');
      console.log(`  ✓ ${target}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${target} —— ${e.message}`);
    }
  }
  console.log(`\n  完成 ${ok}/${dirs.length}。重开一个会话，让 agent 重新加载技能列表。`);
}

({ help, check, link, '-h': help, '--help': help }[cmd] || (() => {
  console.error(`  未知命令: ${cmd}\n`);
  help();
  process.exit(1);
}))();
