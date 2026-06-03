/**
 * 智能版艾宾浩斯记忆曲线
 * ----------------------------------------------------------------
 * 设计：
 *   - 答错 → 重返周期短
 *   - 答对 → 重返周期拉长
 *   - 用 ebbinghausLevel 0~5 表示"掌握等级"，每答对+1，答错重置为 0
 *
 * 等级 → 距离下次复习天数（30 天上限，离中考 17 天内自动收紧）
 */
(function (global) {
  'use strict';

  const Ebbinghaus = {
    // 根据答题结果 + 当前等级，算下次复习的"应到日期"
    nextReview: function (prev, isCorrect) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let level = (prev && prev.ebbinghausLevel) || 0;
      if (!isCorrect) level = 0;
      else level = Math.min(level + 1, 5);

      // 基础间隔（天）
      const baseInterval = [1, 1, 3, 7, 15, 30];
      let interval = baseInterval[level];

      // 距离中考 ≤ 7 天：所有间隔压缩到 ≤ 2 天
      // 距离中考 ≤ 3 天：所有间隔压缩到 ≤ 1 天
      const exam = this.getExamDate();
      if (exam) {
        const days = Math.ceil((exam - today) / 86400000);
        if (days <= 3) interval = Math.min(interval, 1);
        else if (days <= 7) interval = Math.min(interval, 2);
      }

      const next = new Date(today);
      next.setDate(next.getDate() + interval);
      return {
        ebbinghausLevel: level,
        nextReviewAt: next.toISOString().slice(0, 10)
      };
    },

    getExamDate: function () {
      // 从 settings 读 exam_date
      const s = global.Storage && global.Storage.getSettings && global.Storage.getSettings();
      if (s && s.examDate) {
        const d = new Date(s.examDate);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      return null;
    },

    // 计算"今日待复习题"（应到 ≤ 今天）
    filterDueForReview: function (answers, today) {
      const t = today || new Date().toISOString().slice(0, 10);
      const seen = new Map();
      for (const a of answers) {
        if (!seen.has(a.questionId)) {
          seen.set(a.questionId, a);
        }
      }
      const due = [];
      for (const [qid, a] of seen) {
        if (a.nextReviewAt && a.nextReviewAt <= t) {
          due.push(a);
        }
      }
      return due;
    },

    // 计算"今日新题"（还没答过的）
    filterNew: function (answers, allQuestionIds) {
      const seen = new Set(answers.map((a) => a.questionId));
      return [...allQuestionIds].filter((id) => !seen.has(id));
    },

    // 错题本（曾经答错过的题）
    filterWrong: function (answers) {
      const seen = new Map();
      for (const a of answers) {
        if (!seen.has(a.questionId) || !seen.get(a.questionId).correct) {
          seen.set(a.questionId, a);
        }
      }
      return [...seen.values()].filter((a) => !a.correct);
    }
  };

  global.Ebbinghaus = Ebbinghaus;
})(window);
