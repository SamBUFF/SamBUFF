# BUFF

## 📢 公告

> **2026-10-26 · 两个 Agent Skill 开源**
>
> **[chaoxing-labor-course](https://github.com/SamBUFF/chaoxing-labor-course)** —— 超星学习通 / 泛雅课程自动化：视频按平台允许倍速真播到达标、PPT/PDF 任务点走完阅读流程、章节测验作答、空白小节补访问，让整门课目录全绿。
>
> **[yiban-exam](https://github.com/SamBUFF/yiban-exam)** —— 优课 / 易班在线考试作答：依据本地资料（学生手册、法规原文等 docx/pdf）逐题找条款、标注依据行号、全量复验。**只作答，不交卷。**
>
> 两个仓库都带了 README、安装说明、依赖清单与 MIT License，可直接自取。

广东工程职业技术学院 2026 级。喜欢把重复的网页操作做成**可复用、可回读验证**的自动化工具 —— 不靠"看起来点成功了"，每一步都用页面真实状态确认。

## 项目

| 项目 | 是什么 |
| :-- | :-- |
| **[gdep-xuanke-helper](https://github.com/SamBUFF/gdep-xuanke-helper)** | 正方教务（zftal-ui-v5）通用选课助手：Chrome MV3 扩展 + 零依赖 Node CLI。不点「查询」也能查课、掉线自动重登续抢、按星期/节次/周次筛选、定时开抢、冲突时自动退可退选修课（默认关闭）。 |
| **[chaoxing-labor-course](https://github.com/SamBUFF/chaoxing-labor-course)** | 超星学习通 / 泛雅课程自动化 Agent Skill：视频按平台允许倍速真播到达标、PPT/PDF 任务点走完阅读流程、章节测验作答、空白小节补访问，让整门课目录全绿。 |
| **[yiban-exam](https://github.com/SamBUFF/yiban-exam)** | 优课 / 易班在线考试自动作答 Agent Skill：依据本地资料（学生手册、法规原文等 docx/pdf）逐题找条款作答、标注依据行号、全量复验。**只作答，不交卷。** |

## Agent Skills

两个 skill 都是「Markdown 流程文档 + 驱动脚本」的形式，放进 skill 目录即可被 Agent 加载：

```bash
git clone https://github.com/SamBUFF/chaoxing-labor-course.git "$HOME/.workbuddy/skills/chaoxing-labor-course"
git clone https://github.com/SamBUFF/yiban-exam.git            "$HOME/.workbuddy/skills/yiban-exam"
```

它们共享同一套设计原则：

- **可逆优先**：提交类动作默认不做，必须显式 `--yes` 或人工确认；交卷这类不可逆操作一律交给用户
- **不猜**：答案必须能指到资料的具体行号，查不到就标「推断」并单独列出，绝不静默凑数
- **以回读为准**：React 异步渲染下同一次求值读到的是旧值，复验一律另发一次
- **不伪造**：视频只真播，不跳进度、不打假上报接口

## 技术栈

`Node.js` · `Python` · `Chrome Extension MV3` · `Chrome DevTools Protocol`
