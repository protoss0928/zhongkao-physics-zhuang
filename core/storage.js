/**
 * 阿风 5 层记忆系统 + 阿风的中考小程序 = 同一套 IndexedDB 封装
 * ----------------------------------------------------------------
 * 数据模型：
 *   users:       { id, name, avatar, createdAt }
 *   answers:     { id, userId, questionId, chapter, type, userAnswer, correct, ts, ebbinghausLevel }
 *   settings:    { id: 'global', currentUserId, soundOn, examDate, subject }
 *   sessions:    { id, userId, startedAt, endedAt, questionCount, correctCount }
 *
 * 容错：localStorage 降级（微信内 IndexedDB 不可用时）
 */
(function (global) {
  'use strict';

  const DB_NAME = 'exam_review_db';
  const DB_VERSION = 1;
  const STORES = {
    users: 'users',
    answers: 'answers',
    settings: 'settings',
    sessions: 'sessions'
  };

  let _db = null;
  let _useLS = false;

  // ===== IndexedDB 打开（带 localStorage 降级） =====
  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      if (!global.indexedDB) {
        _useLS = true;
        return resolve(null);
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.users)) {
          db.createObjectStore(STORES.users, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.answers)) {
          const s = db.createObjectStore(STORES.answers, { keyPath: 'id' });
          s.createIndex('byUser', 'userId', { unique: false });
          s.createIndex('byChapter', 'chapter', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.sessions)) {
          db.createObjectStore(STORES.sessions, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => { _useLS = true; resolve(null); };
    });
  }

  // ===== 通用 CRUD =====
  function put(storeName, value) {
    return openDB().then((db) => {
      if (_useLS) {
        const k = `${storeName}:${value.id}`;
        localStorage.setItem(k, JSON.stringify(value));
        return value;
      }
      return new Promise((res, rej) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => res(value);
        tx.onerror = (e) => rej(e);
      });
    });
  }

  function get(storeName, id) {
    return openDB().then((db) => {
      if (_useLS) {
        const v = localStorage.getItem(`${storeName}:${id}`);
        return v ? JSON.parse(v) : null;
      }
      return new Promise((res, rej) => {
        const tx = db.transaction(storeName, 'readonly');
        const r = tx.objectStore(storeName).get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = (e) => rej(e);
      });
    });
  }

  function getAll(storeName) {
    return openDB().then((db) => {
      if (_useLS) {
        const list = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith(`${storeName}:`)) {
            list.push(JSON.parse(localStorage.getItem(k)));
          }
        }
        return list;
      }
      return new Promise((res, rej) => {
        const tx = db.transaction(storeName, 'readonly');
        const r = tx.objectStore(storeName).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = (e) => rej(e);
      });
    });
  }

  function getByIndex(storeName, indexName, value) {
    return openDB().then((db) => {
      if (_useLS) {
        return getAll(storeName).then((list) => list.filter((x) => x[indexName] === value));
      }
      return new Promise((res, rej) => {
        const tx = db.transaction(storeName, 'readonly');
        const r = tx.objectStore(storeName).index(indexName).getAll(value);
        r.onsuccess = () => res(r.result || []);
        r.onerror = (e) => rej(e);
      });
    });
  }

  function del(storeName, id) {
    return openDB().then((db) => {
      if (_useLS) {
        localStorage.removeItem(`${storeName}:${id}`);
        return true;
      }
      return new Promise((res, rej) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => res(true);
        tx.onerror = (e) => rej(e);
      });
    });
  }

  // ===== 业务方法 =====
  const Storage = {
    // 用户
    listUsers: () => getAll(STORES.users),
    getUser: (id) => get(STORES.users, id),
    saveUser: (u) => put(STORES.users, u),
    deleteUser: (id) => del(STORES.users, id),

    // 答题记录
    listAnswers: (userId) => userId ? getByIndex(STORES.answers, 'byUser', userId) : getAll(STORES.answers),
    listAnswersByChapter: (userId, chapter) =>
      getByIndex(STORES.answers, 'byUser', userId).then((list) =>
        list.filter((a) => a.chapter === chapter)
      ),
    saveAnswer: (a) => put(STORES.answers, a),
    getAnswer: (userId, questionId) =>
      getAll(STORES.answers).then((list) => {
        if (list.length > 1000) {
          // 大量数据时只查最近 200
          list = list.slice(-200);
        }
        return list.find((a) => a.userId === userId && a.questionId === questionId) || null;
      }),

    // 全局设置
    getSettings: () => get(STORES.settings, 'global'),
    saveSettings: (s) => put(STORES.settings, Object.assign({ id: 'global' }, s)),

    // 会话记录
    listSessions: (userId) => userId ? getByIndex(STORES.sessions, 'byUser', userId) : getAll(STORES.sessions),
    saveSession: (s) => put(STORES.sessions, s),

    // 导出/导入（备份）
    exportAll: async function () {
      const out = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        users: await this.listUsers(),
        answers: await this.listAnswers(),
        settings: await this.getSettings(),
        sessions: await this.listSessions()
      };
      return out;
    },
    importAll: async function (data) {
      for (const u of data.users || []) await this.saveUser(u);
      for (const a of data.answers || []) await this.saveAnswer(a);
      for (const s of data.sessions || []) await this.saveSession(s);
      if (data.settings) await this.saveSettings(data.settings);
      return true;
    },

    isUsingLS: () => _useLS,
    STORES
  };

  global.Storage = Storage;
})(window);
