/**
 * UI 状态机
 * ----------------------------------------------------------------
 * 状态：home（首页）/ chapterSelect（章节选择）/ quiz（答题中）/ result（结算）
 * 数据：currentUser / currentChapter / quizSession
 */
(function (global) {
  'use strict';

  const UI = {
    state: {
      screen: 'home',
      currentUser: null,
      currentChapter: null,
      session: null
    },

    // ====== 屏幕切换 ======
    show: function (screenName) {
      document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
      const target = document.getElementById('screen-' + screenName);
      if (target) target.classList.add('active');
      this.state.screen = screenName;
      window.scrollTo(0, 0);
    },

    // ====== 渲染首页 ======
    renderHome: async function () {
      const settings = await Storage.getSettings();
      this.state.currentUser = settings && settings.currentUserId
        ? await Storage.getUser(settings.currentUserId)
        : null;
      // 倒计时
      const exam = settings && settings.examDate ? new Date(settings.examDate) : new Date('2026-06-19');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.max(0, Math.ceil((exam - today) / 86400000));
      document.getElementById('countdown-days').textContent = days;
      document.getElementById('countdown-exam').textContent =
        `${exam.getFullYear()}-${String(exam.getMonth()+1).padStart(2,'0')}-${String(exam.getDate()).padStart(2,'0')}`;

      // 用户列表
      const users = await Storage.listUsers();
      this._renderUserBar(users);

      // 章节进度
      this._renderChapters();

      // 统计卡
      if (this.state.currentUser) {
        const stats = await Engine.stats(this.state.currentUser.id);
        document.getElementById('stat-total').textContent = stats.totalAnswered;
        document.getElementById('stat-correct').textContent = stats.correctCount;
        document.getElementById('stat-accuracy').textContent = stats.accuracy + '%';

        // 今日待复习
        const answers = await Storage.listAnswers(this.state.currentUser.id);
        const due = Ebbinghaus.filterDueForReview(answers);
        document.getElementById('stat-review').textContent = due.length;
        if (due.length > 0) {
          document.getElementById('review-banner').style.display = 'block';
          document.getElementById('review-count').textContent = due.length;
        } else {
          document.getElementById('review-banner').style.display = 'none';
        }
      }
    },

    _renderUserBar: function (users) {
      const list = document.getElementById('user-list');
      list.innerHTML = '';
      if (users.length === 0) {
        list.innerHTML = '<div style="color: var(--text-light); font-size: 13px;">点击右侧 + 添加新用户</div>';
      }
      for (const u of users) {
        const pill = document.createElement('div');
        pill.className = 'user-pill' + (this.state.currentUser && this.state.currentUser.id === u.id ? ' active' : '');
        pill.textContent = '👤 ' + u.name;
        pill.onclick = () => this._switchUser(u);
        list.appendChild(pill);
      }
      const addBtn = document.createElement('div');
      addBtn.className = 'user-pill add';
      addBtn.textContent = '+ 添加';
      addBtn.onclick = () => this._showAddUserModal();
      list.appendChild(addBtn);
    },

    _renderChapters: async function () {
      // 优先用内联数据（file:// 协议下 fetch 被禁用）
      let data = window.__PHYSICS_DATA__ || await (await fetch('data/physics/chapters.json')).json();
      // 兼容两种结构：chapters 是数组 或 包含 chapters 字段的对象
      if (data.chapters && !Array.isArray(data.chapters)) data = data.chapters;
      const grid = document.getElementById('chapter-grid');
      grid.innerHTML = '';

      let userStats = {};
      if (this.state.currentUser) {
        const answers = await Storage.listAnswers(this.state.currentUser.id);
        for (const a of answers) {
          if (!userStats[a.chapter]) userStats[a.chapter] = { total: 0, max: 0 };
          userStats[a.chapter].total += 1;
          userStats[a.chapter].max = Math.max(userStats[a.chapter].max, a.ebbinghausLevel || 0);
        }
      }

      // 先建索引（for 循环里要用）
      window.__CHAPTERS_INDEX__ = {};
      for (const c of data.chapters) {
        window.__CHAPTERS_INDEX__[c.idx] = c;
      }

      for (const c of data.chapters) {
        const card = document.createElement('div');
        card.className = 'chapter-card';
        card.style.borderTop = `4px solid ${c.color}`;
        card.setAttribute('data-chapter-idx', c.idx);
        const s = userStats[c.idx];
        const progress = s ? Math.min(100, s.total * 20) : 0;
        const isComplete = s && s.max >= 3;
        card.innerHTML = `
          <span class="icon">${c.icon}</span>
          <div class="title">第${c.idx}章<br>${c.title}</div>
          ${isComplete ? '<span class="badge">✓ 已掌握</span>' : ''}
          <div class="progress"><div class="bar" style="width:${progress}%"></div></div>
        `;
        // 用内联 onclick（不用 addEventListener，避免事件冒泡/模拟点击问题）
        card.setAttribute('onclick', `UI.startChapter(window.__CHAPTERS_INDEX__[${c.idx}])`);
        grid.appendChild(card);
      }
    },

    _switchUser: async function (user) {
      this.state.currentUser = user;
      const s = (await Storage.getSettings()) || {};
      s.currentUserId = user.id;
      await Storage.saveSettings(s);
      await this.renderHome();
      AudioMgr.click();
    },

    _showAddUserModal: function () {
      document.getElementById('modal-add-user').classList.add('active');
      document.getElementById('new-user-name').value = '';
      setTimeout(() => document.getElementById('new-user-name').focus(), 100);
    },

    _addUser: async function (name) {
      if (!name || !name.trim()) return;
      const u = {
        id: 'u_' + Date.now(),
        name: name.trim().slice(0, 12),
        avatar: '👤',
        createdAt: Date.now()
      };
      await Storage.saveUser(u);
      this.state.currentUser = u;
      const s = (await Storage.getSettings()) || {};
      s.currentUserId = u.id;
      await Storage.saveSettings(s);
      document.getElementById('modal-add-user').classList.remove('active');
      await this.renderHome();
      AudioMgr.correct();
    },

    // ====== 开始章节 ======
    startChapter: async function (chapter) {
      if (!this.state.currentUser) {
        alert('请先添加用户');
        return;
      }
      this.state.currentChapter = chapter;

      // 取章节题（优先用内联数据，兼容 file:// 协议）
      let data = window.__PHYSICS_DATA__ || await (await fetch('data/physics/questions.json')).json();
      // 兼容 2 种内联结构：__PHYSICS_DATA__.questions 可能是数组 / {questions: [...]} / {questions: {questions: [...]}}
      // 剥到 questions 是数组为止
      while (data.questions && !Array.isArray(data.questions)) data = data.questions;
      const allQs = data.questions.filter((q) => q.chapter === chapter.idx);
      if (allQs.length === 0) {
        alert('该章节暂无题目');
        return;
      }

      // 取该用户已答题记录
      const answers = await Storage.listAnswersByChapter(this.state.currentUser.id, chapter.idx);
      const answeredIds = new Set(answers.map((a) => a.questionId));
      // 优先出未答过的题，已答过的随机混 30%
      const unanswered = allQs.filter((q) => !answeredIds.has(q.id));
      const answered = allQs.filter((q) => answeredIds.has(q.id));
      const sessionQs = [
        ...unanswered,
        ...answered.sort(() => Math.random() - 0.5).slice(0, Math.ceil(unanswered.length * 0.3))
      ].sort(() => Math.random() - 0.5);

      this.state.session = {
        chapter: chapter,
        questions: sessionQs,
        idx: 0,
        correctCount: 0,
        wrongIds: [],
        userAnswer: null
      };
      this._renderQuiz();
      this.show('quiz');
    },

    _renderQuiz: function () {
      const sess = this.state.session;
      const q = sess.questions[sess.idx];
      if (!q) return this._showResult();

      // 进度
      const total = sess.questions.length;
      const cur = sess.idx + 1;
      document.getElementById('quiz-progress').textContent = `${cur} / ${total}`;
      document.getElementById('quiz-score').textContent = `✓ ${sess.correctCount}`;
      document.getElementById('quiz-chapter').textContent = `第${sess.chapter.idx}章 · ${sess.chapter.title}`;

      // 题干
      const stemEl = document.getElementById('question-stem');
      stemEl.textContent = q.stem;

      // 题型标签
      const meta = document.getElementById('question-meta');
      meta.innerHTML = `<span class="tag ${q.type}">${q.type === 'choice' ? '选择题' : '填空题'}</span>`;

      // 渲染输入
      const inputArea = document.getElementById('question-input');
      inputArea.innerHTML = '';
      const feedback = document.getElementById('feedback');
      feedback.className = 'feedback';
      feedback.style.display = 'none';
      sess.userAnswer = null;

      if (q.type === 'choice') {
        const opts = document.createElement('div');
        opts.className = 'options';
        for (const opt of q.options) {
          const letter = opt.charAt(0);
          const o = document.createElement('div');
          o.className = 'option';
          o.innerHTML = `<span class="letter">${letter}</span><span>${opt.slice(2)}</span>`;
          o.onclick = () => {
            if (feedback.style.display === 'block') return;
            document.querySelectorAll('.option').forEach((x) => x.classList.remove('selected'));
            o.classList.add('selected');
            sess.userAnswer = letter;
          };
          opts.appendChild(o);
        }
        inputArea.appendChild(opts);
      } else if (q.type === 'fill') {
        const wrap = document.createElement('div');
        wrap.className = 'fill-inputs';
        const expected = q.answer;
        expected.forEach((_, i) => {
          const row = document.createElement('div');
          row.className = 'fill-input';
          row.innerHTML = `<label>空${i+1}：</label><input type="text" data-idx="${i}" autocomplete="off" />`;
          wrap.appendChild(row);
        });
        inputArea.appendChild(wrap);
        // 自动聚焦第一个
        setTimeout(() => wrap.querySelector('input')?.focus(), 100);
        // 监听输入
        wrap.querySelectorAll('input').forEach((inp) => {
          inp.oninput = () => {
            sess.userAnswer = [...wrap.querySelectorAll('input')].map((x) => x.value);
          };
        });
      }

      // 提交按钮
      document.getElementById('btn-submit').style.display = '';
      document.getElementById('btn-submit').onclick = () => this._submitAnswer();
      document.getElementById('btn-next').style.display = 'none';
    },

    _submitAnswer: async function () {
      const sess = this.state.session;
      const q = sess.questions[sess.idx];
      const uAns = sess.userAnswer;
      if (uAns == null || (Array.isArray(uAns) && uAns.some((x) => !x || !x.trim()))) {
        alert('请先作答');
        return;
      }

      // 判定
      const isCorrect = Engine.checkAnswer(q, uAns);
      const record = await Engine.submit(this.state.currentUser.id, q, uAns);
      sess.correctCount += isCorrect ? 1 : 0;
      if (!isCorrect) sess.wrongIds.push(q.id);

      // 播放音效
      if (isCorrect) AudioMgr.correct(); else AudioMgr.wrong();

      // 视觉反馈
      const fb = document.getElementById('feedback');
      fb.className = 'feedback ' + (isCorrect ? 'correct' : 'wrong');
      fb.style.display = 'block';
      const ansText = Array.isArray(q.answer) ? q.answer.join(' / ') : q.answer;
      fb.innerHTML = `
        <h4>${isCorrect ? '✓ 回答正确' : '✗ 回答错误'}</h4>
        <p>${q.explanation}</p>
        <div class="correct-answer">正确答案：${ansText}</div>
      `;

      // 标记选项
      if (q.type === 'choice') {
        document.querySelectorAll('.option').forEach((opt) => {
          const letter = opt.querySelector('.letter').textContent;
          opt.classList.add('disabled');
          if (letter === q.answer) opt.classList.add('correct');
          if (letter === uAns && !isCorrect) opt.classList.add('wrong');
        });
      } else if (q.type === 'fill') {
        const inputs = document.querySelectorAll('.fill-input input');
        inputs.forEach((inp, i) => {
          if (inp.value.trim() === q.answer[i]) inp.classList.add('correct');
          else inp.classList.add('wrong');
          inp.disabled = true;
        });
      }

      if (!isCorrect) {
        document.getElementById('question-stem').parentElement.classList.add('shake');
        setTimeout(() => document.getElementById('question-stem').parentElement.classList.remove('shake'), 300);
      }

      // 按钮切换
      document.getElementById('btn-submit').style.display = 'none';
      document.getElementById('btn-next').style.display = '';
      const isLast = sess.idx >= sess.questions.length - 1;
      document.getElementById('btn-next').textContent = isLast ? '查看结果 →' : '下一题 →';
      document.getElementById('btn-next').onclick = () => this._nextQuestion();
    },

    _nextQuestion: function () {
      this.state.session.idx += 1;
      this._renderQuiz();
    },

    _showResult: function () {
      const sess = this.state.session;
      const total = sess.questions.length;
      const correct = sess.correctCount;
      const acc = total > 0 ? Math.round(correct * 100 / total) : 0;

      document.getElementById('result-icon').textContent = acc >= 80 ? '🎉' : acc >= 60 ? '👍' : '💪';
      document.getElementById('result-score').textContent = `${acc}%`;
      document.getElementById('result-text').textContent =
        `${correct} / ${total} 题正确${sess.wrongIds.length > 0 ? ` · ${sess.wrongIds.length} 题入错题本` : ''}`;

      // 章节完成
      if (acc >= 80) AudioMgr.chapterComplete();
      this.show('result');
    },

    // ====== 复习模式 ======
    startReview: async function () {
      if (!this.state.currentUser) {
        alert('请先选择用户');
        return;
      }
      const answers = await Storage.listAnswers(this.state.currentUser.id);
      const due = Ebbinghaus.filterDueForReview(answers);
      if (due.length === 0) {
        alert('今日无待复习题！');
        return;
      }
      // 拿题目（优先用内联数据，兼容 file:// 协议）
      let data = window.__PHYSICS_DATA__ || await (await fetch('data/physics/questions.json')).json();
      while (data.questions && !Array.isArray(data.questions)) data = data.questions;
      const qMap = new Map(data.questions.map((q) => [q.id, q]));
      const reviewQs = due.map((a) => qMap.get(a.questionId)).filter(Boolean);
      if (reviewQs.length === 0) {
        alert('待复习题已不存在');
        return;
      }

      this.state.session = {
        chapter: { idx: 0, title: '今日复习', icon: '🔁', color: '#f59e0b' },
        questions: reviewQs.slice(0, 20), // 单次复习最多 20 题
        idx: 0,
        correctCount: 0,
        wrongIds: [],
        userAnswer: null,
        isReview: true
      };
      this._renderQuiz();
      this.show('quiz');
    },

    // ====== 错题本 ======
    showWrongBook: async function () {
      if (!this.state.currentUser) {
        alert('请先选择用户');
        return;
      }
      const answers = await Storage.listAnswers(this.state.currentUser.id);
      const wrong = Ebbinghaus.filterWrong(answers);
      const resp = await fetch('data/physics/questions.json');
      let data = await resp.json();
      while (data.questions && !Array.isArray(data.questions)) data = data.questions;
      const qMap = new Map(data.questions.map((q) => [q.id, q]));
      const list = document.getElementById('wrong-list');
      list.innerHTML = '';
      if (wrong.length === 0) {
        list.innerHTML = '<div class="empty"><div class="icon">🎯</div>暂无错题</div>';
      } else {
        for (const a of wrong) {
          const q = qMap.get(a.questionId);
          if (!q) continue;
          const item = document.createElement('div');
          item.className = 'wrong-item';
          const ans = Array.isArray(q.answer) ? q.answer.join(' / ') : q.answer;
          item.innerHTML = `<div style="font-weight:600; margin-bottom:4px;">第${q.chapter}章 · ${q.type === 'choice' ? '选择题' : '填空题'}</div><div style="color: var(--text); margin-bottom: 6px; line-height:1.5;">${q.stem}</div><small style="color:var(--error); font-weight:500;">正确答案：${ans}</small>`;
          list.appendChild(item);
        }
      }
      this.show('wrongBook');
    },

    // ====== 备份/恢复 ======
    exportData: async function () {
      const data = await Storage.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `中考复习_备份_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert('备份已下载！');
    },

    importData: function (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          await Storage.importAll(data);
          alert('恢复成功！');
          await this.renderHome();
        } catch (err) {
          alert('文件格式错误：' + err.message);
        }
      };
      reader.readAsText(file);
    }
  };

  global.UI = UI;
})(window);
