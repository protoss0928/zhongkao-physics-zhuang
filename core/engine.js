/**
 * 答题引擎 - 题型无关
 * ----------------------------------------------------------------
 * 支持：choice / fill / brief（简答预留）
 * 关键：
 *   - 比对答案（容忍度：填空题去除空格、标点、繁简体差异）
 *   - 记录到 storage.answers
 *   - 触发 Ebbinghaus 计算下次复习时间
 */
(function (global) {
  'use strict';

  const Engine = {
    /**
     * 判定用户答案是否正确
     * @param question {object} 题对象
     * @param userAnswer {string|string[]}
     * @returns {boolean}
     */
    checkAnswer: function (question, userAnswer) {
      if (question.type === 'choice') {
        if (typeof userAnswer !== 'string') return false;
        return userAnswer.toUpperCase().trim() === question.answer.toUpperCase().trim();
      }
      if (question.type === 'fill') {
        const expects = Array.isArray(question.answer) ? question.answer : [question.answer];
        const users = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
        if (users.length !== expects.length) return false;
        for (let i = 0; i < expects.length; i++) {
          if (!this._match(expects[i], users[i])) return false;
        }
        return true;
      }
      if (question.type === 'brief') {
        // 简答题需要人工判分：默认给分
        return !!userAnswer && userAnswer.trim().length > 0;
      }
      return false;
    },

    // 填空题模糊匹配
    _match: function (expected, actual) {
      if (expected == null || actual == null) return false;
      const norm = (s) => String(s)
        .replace(/[\s　，,。.!！？?、；;:'"‘’“”()（）\[\]【】《》<>·•\-—_/\\|]/g, '')
        .replace(/（.+?）/g, '')
        .toLowerCase();
      return norm(expected) === norm(actual);
    },

    /**
     * 提交答案（一次性完成存储 + 复习时间计算）
     */
    submit: async function (userId, question, userAnswer) {
      if (!userId) throw new Error('未指定用户');
      if (!question || !question.id) throw new Error('题目无效');

      const isCorrect = this.checkAnswer(question, userAnswer);

      // 取上一条答题记录
      const prev = await Storage.getAnswer(userId, question.id);
      const ebs = Ebbinghaus.nextReview(prev, isCorrect);

      const record = {
        id: `${userId}_${question.id}_${Date.now()}`,
        userId: userId,
        questionId: question.id,
        chapter: question.chapter,
        type: question.type,
        userAnswer: userAnswer,
        correct: isCorrect,
        ts: Date.now(),
        ebbinghausLevel: ebs.ebbinghausLevel,
        nextReviewAt: ebs.nextReviewAt
      };
      await Storage.saveAnswer(record);
      return record;
    },

    /**
     * 选题：随机抽 N 题（避免重复）
     */
    pickQuestions: function (all, n, excludeIds) {
      const pool = all.filter((q) => !(excludeIds || []).includes(q.id));
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    },

    /**
     * 用户统计
     */
    stats: async function (userId) {
      const answers = await Storage.listAnswers(userId);
      const total = answers.length;
      const correct = answers.filter((a) => a.correct).length;
      // 章节分布
      const byChapter = {};
      for (const a of answers) {
        if (!byChapter[a.chapter]) byChapter[a.chapter] = { total: 0, correct: 0 };
        byChapter[a.chapter].total += 1;
        if (a.correct) byChapter[a.chapter].correct += 1;
      }
      return {
        totalAnswered: total,
        correctCount: correct,
        accuracy: total > 0 ? (correct * 100 / total).toFixed(1) : 0,
        byChapter: byChapter
      };
    }
  };

  global.Engine = Engine;
})(window);
