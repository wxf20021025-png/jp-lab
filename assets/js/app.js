/* ひなた日本語ラボ — 应用逻辑 */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const LESSONS = [...(window.LESSONS_A || []), ...(window.LESSONS_B || [])];
  const STORE_KEY = "jp-lab-progress-v1";

  /* ---------------- 进度存储 ---------------- */
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function defaultProgress() {
    return {
      firstSeen: todayStr(),
      done: {},
      lastLesson: 1,
      kana: { correct: 0, total: 0 },
      mistakes: [],
      quizHistory: []
    };
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultProgress();
      const p = JSON.parse(raw);
      return Object.assign(defaultProgress(), p, {
        kana: Object.assign({ correct: 0, total: 0 }, p.kana || {}),
        mistakes: Array.isArray(p.mistakes) ? p.mistakes : [],
        quizHistory: Array.isArray(p.quizHistory) ? p.quizHistory : [],
        done: p.done || {}
      });
    } catch (e) {
      return defaultProgress();
    }
  }

  let progress = loadProgress();
  const saveProgress = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* 忽略隐私模式限制 */ }
  };

  /* ---------------- 语音 ---------------- */
  const speechOK = typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
  let jaVoice = null;
  let playToken = 0;

  function pickVoice() {
    if (!speechOK) return;
    const voices = window.speechSynthesis.getVoices() || [];
    jaVoice = voices.find(v => /^ja(-|_|$)/i.test(v.lang)) ||
      voices.find(v => /japanese|日本語|kyoko|otoya|takumi|haruka|ichiro|ayumi|sayaka/i.test(v.name)) || null;
    const chip = $("#voiceChip");
    const txt = $("#voiceChipText");
    if (!chip || !txt) return;
    if (!speechOK) {
      chip.classList.add("bad");
      txt.textContent = "此浏览器不支持语音";
    } else if (jaVoice) {
      chip.classList.add("ok");
      txt.textContent = "日语语音：" + jaVoice.name.replace(/\s*\(.*\)/, "").slice(0, 18);
      chip.title = jaVoice.name + " / " + jaVoice.lang;
    } else {
      chip.classList.add("bad");
      txt.textContent = "未检测到日语语音";
      chip.title = "请在系统「时间和语言 → 语言」里添加日语语音包，或使用 Chrome / Edge。";
    }
  }

  if (speechOK) {
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
    setTimeout(pickVoice, 600);
  } else {
    pickVoice();
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!speechOK || !text) {
      if (!speechOK) toast("当前浏览器不支持朗读");
      if (opts.onend) setTimeout(opts.onend, 200);
      return null;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (jaVoice) u.voice = jaVoice;
    u.rate = opts.rate || 0.92;
    u.pitch = 1;
    u.volume = 1;
    if (opts.onend) u.onend = opts.onend;
    u.onerror = () => { if (opts.onend) opts.onend(); };
    window.speechSynthesis.speak(u);
    return u;
  }

  /* 播放条 */
  const player = $("#player");
  const playerText = $("#playerText");
  let lastPlayed = "";

  function showPlayer(text, el) {
    lastPlayed = text || "";
    if (!player) return;
    player.hidden = false;
    playerText.textContent = text || "—";
    $$(".playing-row").forEach(n => n.classList.remove("playing-row"));
    if (el) el.classList.add("playing-row");
  }

  function hidePlayer() {
    if (player) player.hidden = true;
    $$(".playing-row").forEach(n => n.classList.remove("playing-row"));
  }

  function stopAll() {
    playToken++;
    if (speechOK) window.speechSynthesis.cancel();
    hidePlayer();
    $$(".icon-btn.playing").forEach(n => n.classList.remove("playing"));
  }

  /**
   * 顺序朗读
   * list: [{text, el}]
   */
  function playQueue(list, opts) {
    opts = opts || {};
    stopAll();
    const token = ++playToken;
    let i = 0;
    const gap = opts.shadow ? 900 : 420;
    const step = () => {
      if (token !== playToken) return;
      if (i >= list.length) { hidePlayer(); return; }
      const item = list[i++];
      showPlayer(item.text, item.el);
      speak(item.text, {
        rate: opts.rate || 0.92,
        onend: () => {
          if (token !== playToken) return;
          let wait = gap;
          if (opts.shadow) wait = Math.max(1200, (item.text || "").length * 210);
          setTimeout(step, opts.shadow ? wait : 1200 + gap);
        }
      });
    };
    step();
  }

  /* ---------------- 通用 UI ---------------- */
  let toastTimer = null;
  function toast(msg) {
    let el = $("#toastBox");
    if (!el) {
      el = document.createElement("div");
      el.id = "toastBox";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------------- 导航 ---------------- */
  const views = ["home", "kana", "lessons", "anime", "quiz"];

  function go(tab) {
    if (!views.includes(tab)) tab = "home";
    stopAll();
    $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + tab));
    $$(".navlink").forEach(b => b.classList.toggle("active", b.dataset.nav === tab));
    if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (tab === "lessons") renderLesson(progress.lastLesson || 1);
    if (tab === "quiz") renderQuizHistory();
  }

  document.addEventListener("click", e => {
    const nav = e.target.closest("[data-nav]");
    if (nav) { e.preventDefault(); go(nav.dataset.nav); }
  });
  window.addEventListener("hashchange", () => go(location.hash.slice(1) || "home"));

  /* ---------------- 首页 ---------------- */
  function dayNumber() {
    const first = new Date((progress.firstSeen || todayStr()) + "T00:00:00");
    const now = new Date(todayStr() + "T00:00:00");
    const diff = Math.round((now - first) / 86400000) + 1;
    return Math.max(1, diff);
  }

  function renderHome() {
    const doneCount = Object.keys(progress.done).length;
    const acc = progress.kana.total ? Math.round((progress.kana.correct / progress.kana.total) * 100) : 0;
    const words = LESSONS.filter(l => progress.done[l.id]).reduce((n, l) => n + l.words.length, 0);

    $("#heroDay").textContent = dayNumber();
    $("#heroStats").innerHTML = [
      [doneCount + " / 25", "已完成课次"],
      [acc + "%", "五十音正确率"],
      [words, "已学单词"],
      [progress.quizHistory.length, "综合测验次数"]
    ].map(([b, s]) => `<div class="hstat"><b>${b}</b><span>${s}</span></div>`).join("");

    const idx = Math.floor(Date.now() / 86400000) % LESSONS.length;
    const l = LESSONS[idx] || LESSONS[0];
    const line = l.reibun[(new Date().getDate()) % l.reibun.length] || l.reibun[0];
    $("#dailyJp").textContent = line.jp;
    $("#dailyCn").textContent = line.cn;
    $("#dailyLesson").textContent = "第 " + l.id + " 課 · " + l.title;
    $("#dailyPlay").onclick = () => speak(line.jp);

    const cont = $("#btnContinue");
    const next = LESSONS.find(x => !progress.done[x.id]) || LESSONS[LESSONS.length - 1];
    cont.textContent = doneCount >= LESSONS.length ? "复习最后一课 →" : "继续学习：第 " + next.id + " 課 →";
    cont.onclick = () => { progress.lastLesson = next.id; saveProgress(); go("lessons"); renderLesson(next.id); };
  }

  /* ---------------- 五十音 ---------------- */
  let kanaScript = "hiragana";
  let kanaGroup = "basic";

  function kanaList() {
    return (window.KANA[kanaScript] || {})[kanaGroup] || [];
  }

  const KANA_ROW_LABELS = {
    hiragana: {
      basic: ["あ行", "か行", "さ行", "た行", "な行", "は行", "ま行", "や行", "ら行", "わ行", "ん"],
      dakuten: ["が行", "ざ行", "だ行", "ば行", "ぱ行"],
      yoon: ["きゃ行", "しゃ行", "ちゃ行", "にゃ行", "ひゃ行", "みゃ行", "りゃ行", "ぎゃ行", "じゃ行", "びゃ行", "ぴゃ行"]
    },
    katakana: {
      basic: ["ア行", "カ行", "サ行", "タ行", "ナ行", "ハ行", "マ行", "ヤ行", "ラ行", "ワ行", "ン"],
      dakuten: ["ガ行", "ザ行", "ダ行", "バ行", "パ行"],
      yoon: ["キャ行", "シャ行", "チャ行", "ニャ行", "ヒャ行", "ミャ行", "リャ行", "ギャ行", "ジャ行", "ビャ行", "ピャ行"]
    }
  };

  function renderKanaGrid() {
    const list = kanaList();
    const showRo = $("#showRomaji").checked;
    const grid = $("#kanaGrid");
    grid.classList.toggle("hide-ro", !showRo);
    const chunk = kanaGroup === "yoon" ? 3 : 5;
    const labels = (KANA_ROW_LABELS[kanaScript] || {})[kanaGroup] || [];
    let html = "";
    let rowIndex = 0;
    for (let i = 0; i < list.length; i += chunk, rowIndex++) {
      const row = list.slice(i, i + chunk);
      html += '<div class="kana-row-wrap">';
      html += '<span class="kana-row-label">' + esc(labels[rowIndex] || "") + "</span>";
      html += '<div class="kana-row' + (kanaGroup === "yoon" ? " row-yoon" : "") + '">';
      row.forEach(([ch, ro], j) => {
        if (!ch) {
          html += '<div class="kana-cell empty"></div>';
        } else {
          const rowName = kanaGroup === "basic" ? Math.floor((i + j) / 5) : -1;
          html += `<button class="kana-cell" data-ch="${esc(ch)}" data-ro="${esc(ro)}" data-row="${rowName}">
            <span class="ch">${esc(ch)}</span><span class="ro">${esc(ro)}</span>
          </button>`;
        }
      });
      html += "</div></div>";
    }
    grid.innerHTML = html;
  }

  function renderKanaHints() {
    const box = $("#kanaHints");
    if (!box) return;
    if (kanaScript !== "hiragana" || kanaGroup !== "basic") { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<div class="panel-head"><h2>按行记忆</h2><p>先把每行的“辅音＋元音”规律抓住，再记特殊音。</p></div>' +
      '<div class="hint-grid">' + (window.KANA_ROWS.hiragana || []).map(r =>
        `<div class="hint-item"><b>${esc(r.name)}</b><span>${esc(r.hint)}</span></div>`).join("") + "</div>";
  }

  function initKana() {
    $("#kanaScriptSeg").addEventListener("click", e => {
      const b = e.target.closest("[data-script]");
      if (!b) return;
      kanaScript = b.dataset.script;
      $$("#kanaScriptSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      renderKanaGrid(); renderKanaHints();
    });
    $("#kanaGroupSeg").addEventListener("click", e => {
      const b = e.target.closest("[data-group]");
      if (!b) return;
      kanaGroup = b.dataset.group;
      $$("#kanaGroupSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      renderKanaGrid(); renderKanaHints();
    });
    $("#showRomaji").addEventListener("change", renderKanaGrid);
    $("#kanaGrid").addEventListener("click", e => {
      const cell = e.target.closest(".kana-cell[data-ch]");
      if (!cell) return;
      $$(".kana-cell.active").forEach(n => n.classList.remove("active"));
      cell.classList.add("active");
      if ($("#kanaAutoPlay").checked) {
        const rate = ["を", "ん", "ヲ", "ン"].includes(cell.dataset.ch) ? 0.7 : 0.85;
        speak(cell.dataset.ch, { rate });
      }
    });
    $("#kanaQuizStart").addEventListener("click", startKanaQuiz);
    $("#clearKanaMistakes").addEventListener("click", () => {
      progress.mistakes = [];
      saveProgress(); renderMistakes(); toast("错题本已清空");
    });
    renderKanaGrid(); renderKanaHints(); renderMistakes();
  }

  function renderMistakes() {
    const box = $("#kanaMistakes");
    if (!box) return;
    if (!progress.mistakes.length) {
      box.innerHTML = '<p class="muted">还没有错题。做完一轮测验，这里会自动收集。</p>';
      return;
    }
    box.innerHTML = progress.mistakes.map((m, i) =>
      `<button class="mistake-item" data-mistake="${i}"><span>${esc(m.ch)}</span><span class="rm">${esc(m.ro)}</span></button>`).join("");
  }

  document.addEventListener("click", e => {
    const m = e.target.closest("[data-mistake]");
    if (!m) return;
    const item = progress.mistakes[Number(m.dataset.mistake)];
    if (item) speak(item.ch);
  });

  /* 五十音测验 */
  let kq = null;

  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startKanaQuiz() {
    const pool = kanaList().filter(x => x[0] && x[1]);
    if (pool.length < 4) { toast("这一组假名太少，换一组试试"); return; }
    const qs = shuffle(pool).slice(0, Math.min(10, pool.length)).map(item => {
      const reverse = Math.random() < 0.5;
      const others = shuffle(pool.filter(x => x[1] !== item[1])).slice(0, 3);
      const opts = shuffle([item, ...others]);
      return { ch: item[0], ro: item[1], reverse, opts };
    });
    kq = { qs, idx: 0, score: 0, locked: false };
    renderKanaQuiz();
  }

  function renderKanaQuiz() {
    const area = $("#kanaQuizArea");
    if (!kq) return;
    if (kq.idx >= kq.qs.length) {
      const pct = Math.round((kq.score / kq.qs.length) * 100);
      area.innerHTML = `<div class="quiz-done">
        <div class="big-score">${kq.score} / ${kq.qs.length}</div>
        <p class="muted" style="margin:8px 0 16px">正确率 ${pct}%${pct === 100 ? "，这一组可以过了。" : "，错题已进错题本，再听一遍。"}</p>
        <button class="btn btn-primary" id="kqAgain">再来一轮</button>
      </div>`;
      $("#kqAgain").onclick = startKanaQuiz;
      renderMistakes();
      return;
    }
    const q = kq.qs[kq.idx];
    const promptCls = q.reverse ? "quiz-prompt small" : "quiz-prompt";
    area.innerHTML = `<div class="quiz-card">
      <p class="quiz-q">第 ${kq.idx + 1} / ${kq.qs.length} 题 · ${q.reverse ? "罗马音 → 假名" : "假名 → 罗马音"}</p>
      <div class="${promptCls}">${esc(q.reverse ? q.ro : q.ch)}</div>
      <div class="quiz-opts">
        ${q.opts.map(o => `<button class="opt" data-ans="${esc(q.reverse ? o[0] : o[1])}">${esc(q.reverse ? o[0] : o[1])}</button>`).join("")}
      </div>
      <div class="quiz-meta"><span>${kanaScript === "hiragana" ? "平假名" : "片假名"} · ${kanaGroup === "basic" ? "清音" : kanaGroup === "dakuten" ? "浊音" : "拗音"}</span><span>得分 ${kq.score}</span></div>
    </div>`;

    area.querySelectorAll(".opt").forEach(btn => {
      btn.onclick = () => {
        if (kq.locked) return;
        kq.locked = true;
        const answer = q.reverse ? q.ch : q.ro;
        const ok = btn.dataset.ans === answer;
        btn.classList.add(ok ? "correct" : "wrong");
        if (!ok) {
          area.querySelectorAll(".opt").forEach(b => {
            if (b.dataset.ans === answer) b.classList.add("correct");
          });
          if (!progress.mistakes.some(m => m.ch === q.ch)) {
            progress.mistakes.unshift({ ch: q.ch, ro: q.ro });
            progress.mistakes = progress.mistakes.slice(0, 24);
            renderMistakes();
          }
        } else {
          kq.score++;
        }
        progress.kana.total++;
        if (ok) progress.kana.correct++;
        saveProgress();
        speak(q.ch, { rate: 0.8 });
        setTimeout(() => {
          kq.idx++;
          kq.locked = false;
          renderKanaQuiz();
        }, 900);
      };
    });
  }

  /* ---------------- 课文 ---------------- */
  let lessonRate = 0.92;
  let shadowMode = false;
  let showCnState = true;

  function renderLessonList() {
    const list = $("#lessonList");
    const doneCount = Object.keys(progress.done).length;
    $("#lessonProgressText").textContent = doneCount + " / " + LESSONS.length;
    list.innerHTML = LESSONS.map(l =>
      `<button class="lesson-item${l.id === progress.lastLesson ? " active" : ""}" data-lesson="${l.id}">
        <span class="no">${String(l.id).padStart(2, "0")}</span>
        <span class="ttl">${esc(l.title)}</span>
        ${progress.done[l.id] ? '<span class="tick">✓</span>' : ""}
      </button>`).join("");
  }

  $("#lessonList").addEventListener("click", e => {
    const b = e.target.closest("[data-lesson]");
    if (!b) return;
    stopAll();
    renderLesson(Number(b.dataset.lesson));
  });

  function renderLesson(id) {
    const l = LESSONS.find(x => x.id === id) || LESSONS[0];
    progress.lastLesson = l.id;
    saveProgress();
    $$(".lesson-item").forEach(b => b.classList.toggle("active", Number(b.dataset.lesson) === l.id));
    renderLessonList();

    const main = $("#lessonMain");

    main.innerHTML = `
      <div class="lesson-hero">
        <div>
          <p class="lt-no">LESSON ${String(l.id).padStart(2, "0")} · ${esc(l.sub)}</p>
          <h2>${esc(l.title)}</h2>
          <p class="lesson-goal">${esc(l.goal)}</p>
        </div>
        <div class="lesson-hero-actions">
          <button class="btn btn-primary" id="playWhole">▶ 朗读本课例文</button>
          <button class="btn btn-ghost" id="markDone">${progress.done[l.id] ? "✓ 已完成" : "标记完成"}</button>
        </div>
      </div>

      <div class="toolbar lesson-toolbar">
        <label class="switch"><input type="checkbox" id="showCn" ${showCnState ? "checked" : ""} /><span>显示中文</span></label>
        <label class="switch"><input type="checkbox" id="shadowMode" ${shadowMode ? "checked" : ""} /><span>跟读模式（留白）</span></label>
        <label class="ctrl-label">语速
          <select id="rateSel" class="mini-select">
            <option value="0.7">慢速 0.7×</option>
            <option value="0.92" selected>正常 1.0×</option>
            <option value="1.15">快速 1.25×</option>
          </select>
        </label>
        <button class="btn btn-ghost small" id="stopPlay">■ 停止</button>
      </div>

      <section class="section-card">
        <h3>文型 <span class="badge">GRAMMAR</span></h3>
        <p class="section-sub">先看句型，再读例文；每个句型都有使用条件。</p>
        <div class="bunkei">
          ${l.bunkei.map(b => `<div class="bunkei-row">
            <div class="bunkei-jp">${esc(b.jp)}</div>
            <div class="bunkei-cn">${esc(b.cn)}</div>
            ${b.note ? `<div class="bunkei-note">※ ${esc(b.note)}</div>` : ""}
          </div>`).join("")}
        </div>
      </section>

      <section class="section-card">
        <h3>例文 <span class="badge">READ ALOUD</span></h3>
        <p class="section-sub">点 🔊 逐句听；点「朗读本课例文」按顺序循环。跟读模式下每句后会留出复述时间。</p>
        <div class="line-list" id="reibunList">
          ${l.reibun.map((r, i) => `<div class="line-row" data-line="${i}">
            <span class="idx">${String(i + 1).padStart(2, "0")}</span>
            <div class="line-body">
              <div class="line-jp">${esc(r.jp)}</div>
              <div class="line-cn">${esc(r.cn)}</div>
            </div>
            <div class="line-actions">
              <button class="icon-btn" data-play="${i}" title="朗读">🔊</button>
              <button class="icon-btn" data-slow="${i}" title="慢速">🐢</button>
            </div>
          </div>`).join("")}
        </div>
      </section>

      <section class="section-card">
        <h3>会話 <span class="badge">DIALOGUE</span></h3>
        <p class="section-sub">先整段听一遍，再选「遮挡 A」或「遮挡 B」做角色练习；被遮挡的台词鼠标移上去会显示。</p>
        <div class="toolbar" style="margin-bottom:14px">
          <button class="btn btn-ghost small" data-hide="A">遮挡 A 的台词</button>
          <button class="btn btn-ghost small" data-hide="B">遮挡 B 的台词</button>
          <button class="btn btn-ghost small" data-hide="none">全部显示</button>
          <button class="btn btn-ghost small" id="playKaiwa">▶ 整段朗读</button>
        </div>
        <div class="kaiwa" id="kaiwaList">
          ${l.kaiwa.map((k, i) => `<div class="kaiwa-row ${k.sp === "B" ? "right" : ""}" data-sp="${esc(k.sp)}" data-line="${i}">
            <div class="speaker">${esc(k.sp)}</div>
            <div class="bubble">
              <div class="line-jp">${esc(k.jp)}</div>
              <div class="line-cn">${esc(k.cn)}</div>
              <div class="bubble-controls"><button class="icon-btn" data-kplay="${i}" title="朗读">🔊</button></div>
            </div>
          </div>`).join("")}
        </div>
      </section>

      <section class="section-card">
        <h3>单词 <span class="badge">VOCAB</span></h3>
        <p class="section-sub">共 ${l.words.length} 个。点喇叭听发音；不会的词先按假名读一遍。</p>
        <div style="overflow:auto">
          <table class="word-table">
            <thead><tr><th style="width:36px"></th><th>单词</th><th>假名</th><th>词性</th><th>中文</th></tr></thead>
            <tbody>
              ${l.words.map((w, i) => `<tr>
                <td><button class="icon-btn" data-wplay="${i}" title="朗读">🔊</button></td>
                <td class="word-jp">${esc(w.jp)}</td>
                <td class="word-kana">${esc(w.kana)}</td>
                <td><span class="word-type">${esc(w.type || "")}</span></td>
                <td>${esc(w.cn)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <div class="lesson-nav">
        <button class="btn btn-ghost" id="prevLesson" ${l.id <= 1 ? "disabled" : ""}>← 上一课</button>
        <button class="btn btn-ghost" id="nextLesson" ${l.id >= LESSONS.length ? "disabled" : ""}>下一课 →</button>
      </div>
    `;

    /* 事件 */
    main.classList.toggle("hide-cn", !showCnState);
    $("#playWhole").onclick = () => {
      playQueue(l.reibun.map((r, i) => ({
        text: r.jp,
        el: $(`.line-row[data-line="${i}"]`)
      })), { rate: lessonRate, shadow: shadowMode });
    };
    $("#stopPlay").onclick = stopAll;
    $("#showCn").onchange = e => {
      showCnState = e.target.checked;
      main.classList.toggle("hide-cn", !showCnState);
    };
    $("#shadowMode").onchange = e => { shadowMode = e.target.checked; };
    $("#rateSel").onchange = e => { lessonRate = Number(e.target.value); };

    $("#markDone").onclick = () => {
      if (progress.done[l.id]) delete progress.done[l.id];
      else progress.done[l.id] = true;
      saveProgress();
      $("#markDone").textContent = progress.done[l.id] ? "✓ 已完成" : "标记完成";
      renderLessonList(); renderHome();
      toast(progress.done[l.id] ? "第 " + l.id + " 課已完成" : "已取消完成标记");
    };

    $("#reibunList").addEventListener("click", e => {
      const p = e.target.closest("[data-play]");
      const s = e.target.closest("[data-slow]");
      if (p) {
        const i = Number(p.dataset.play);
        const row = $(`.line-row[data-line="${i}"]`);
        playQueue([{ text: l.reibun[i].jp, el: row }], { rate: lessonRate });
      }
      if (s) {
        const i = Number(s.dataset.slow);
        const row = $(`.line-row[data-line="${i}"]`);
        playQueue([{ text: l.reibun[i].jp, el: row }], { rate: 0.62 });
      }
    });

    $("#playKaiwa").onclick = () => {
      playQueue(l.kaiwa.map((k, i) => ({
        text: k.jp,
        el: $(`.kaiwa-row[data-line="${i}"]`)
      })), { rate: lessonRate, shadow: shadowMode });
    };

    $("#kaiwaList").addEventListener("click", e => {
      const b = e.target.closest("[data-kplay]");
      if (!b) return;
      const i = Number(b.dataset.kplay);
      const row = $(`.kaiwa-row[data-line="${i}"]`);
      playQueue([{ text: l.kaiwa[i].jp, el: row }], { rate: lessonRate });
    });

    $$("[data-hide]", main).forEach(btn => {
      btn.onclick = () => {
        const who = btn.dataset.hide;
        $$(".kaiwa-row", main).forEach(row => {
          row.classList.toggle("hidden-line", who !== "none" && row.dataset.sp === who);
        });
      };
    });

    main.querySelector("table").addEventListener("click", e => {
      const b = e.target.closest("[data-wplay]");
      if (!b) return;
      const w = l.words[Number(b.dataset.wplay)];
      speak(w.kana || w.jp, { rate: 0.8 });
    });

    $("#prevLesson").onclick = () => { if (l.id > 1) { stopAll(); renderLesson(l.id - 1); } };
    $("#nextLesson").onclick = () => { if (l.id < LESSONS.length) { stopAll(); renderLesson(l.id + 1); } };
  }

  /* ---------------- 动漫场景 ---------------- */
  let animeTag = "all";

  function renderAnime() {
    const grid = $("#animeGrid");
    const list = (window.ANIME || []).filter(a => animeTag === "all" || a.tag === animeTag);
    grid.innerHTML = list.map(a => `<article class="anime-card">
      <div class="ac-top">
        <span class="ac-tag">${esc(a.tag)}场景</span>
        <span class="ac-lesson">对应第 ${a.lesson} 課</span>
      </div>
      <p class="ac-scene">${esc(a.scene)}</p>
      <p class="ac-line">${esc(a.line)}</p>
      <p class="ac-cn">${esc(a.cn)}</p>
      <div class="ac-box">
        <b>语法点</b>　${esc(a.grammar)}<br />
        ${esc(a.explain)}
      </div>
      <p class="ac-points">语气：${esc(a.tone)}</p>
      <div class="ac-actions">
        <button class="icon-btn" data-aplay="${esc(a.id)}" title="朗读台词">🔊</button>
        <button class="btn btn-ghost small" data-casual="${esc(a.id)}" title="听简体版">简体：${esc(a.casual)}</button>
      </div>
    </article>`).join("");
  }

  function initAnime() {
    $("#animeFilter").addEventListener("click", e => {
      const b = e.target.closest("[data-tag]");
      if (!b) return;
      animeTag = b.dataset.tag;
      $$("#animeFilter .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      renderAnime();
    });
    $("#animeGrid").addEventListener("click", e => {
      const p = e.target.closest("[data-aplay]");
      const c = e.target.closest("[data-casual]");
      if (p) {
        const a = window.ANIME.find(x => x.id === p.dataset.aplay);
        if (a) speak(a.line, { rate: 0.85 });
      }
      if (c) {
        const a = window.ANIME.find(x => x.id === c.dataset.casual);
        if (a) speak(a.casual, { rate: 0.9 });
      }
    });
    renderAnime();
  }

  /* ---------------- 综合测验 ---------------- */
  let cq = null;

  function buildQuizPool() {
    const doneIds = Object.keys(progress.done).map(Number);
    const poolLessons = doneIds.length ? LESSONS.filter(l => progress.done[l.id]) : LESSONS.slice(0, 3);
    const words = [];
    poolLessons.forEach(l => l.words.forEach(w => words.push({ ...w, lesson: l.id })));
    return words;
  }

  function startQuiz() {
    const pool = buildQuizPool();
    if (pool.length < 6) { toast("单词太少，先完成一课"); return; }
    const picked = shuffle(pool).slice(0, 10);
    const qs = picked.map(w => {
      const others = shuffle(pool.filter(x => x.jp !== w.jp)).slice(0, 3);
      return { w, opts: shuffle([w, ...others]) };
    });
    cq = { qs, idx: 0, score: 0, locked: false };
    renderCompQuiz();
  }

  function renderCompQuiz() {
    const area = $("#quizArea");
    if (!cq) return;
    if (cq.idx >= cq.qs.length) {
      const pct = Math.round((cq.score / cq.qs.length) * 100);
      progress.quizHistory.unshift({ date: new Date().toISOString(), score: cq.score, total: cq.qs.length });
      progress.quizHistory = progress.quizHistory.slice(0, 20);
      saveProgress();
      renderQuizHistory(); renderHome();
      area.innerHTML = `<div class="quiz-done">
        <div class="big-score">${cq.score} / ${cq.qs.length}</div>
        <p class="muted" style="margin:8px 0 16px">${pct >= 80 ? "很稳，可以进入下一课。" : pct >= 60 ? "基本掌握，把错的词回课里再听一遍。" : "建议回课文把这一课的单词和例文再读两遍。"}</p>
        <button class="btn btn-primary" id="cqAgain">再来 10 题</button>
      </div>`;
      $("#cqAgain").onclick = startQuiz;
      return;
    }
    const q = cq.qs[cq.idx];
    area.innerHTML = `<div class="quiz-card">
      <p class="quiz-q">第 ${cq.idx + 1} / ${cq.qs.length} 题 · 中文 → 日语（第 ${q.w.lesson} 課）</p>
      <div class="quiz-prompt-cn">${esc(q.w.cn)}</div>
      <div class="quiz-opts">
        ${q.opts.map(o => `<button class="opt" data-ans="${esc(o.jp)}"><span class="word-jp">${esc(o.jp)}</span>${o.kana && o.kana !== o.jp ? `<br /><span class="word-kana">${esc(o.kana)}</span>` : ""}</button>`).join("")}
      </div>
      <div class="quiz-meta"><span>${esc(q.w.type || "")}</span><span>得分 ${cq.score}</span></div>
    </div>`;
    area.querySelectorAll(".opt").forEach(btn => {
      btn.onclick = () => {
        if (cq.locked) return;
        cq.locked = true;
        const ok = btn.dataset.ans === q.w.jp;
        btn.classList.add(ok ? "correct" : "wrong");
        if (!ok) {
          area.querySelectorAll(".opt").forEach(b => { if (b.dataset.ans === q.w.jp) b.classList.add("correct"); });
        } else cq.score++;
        speak(q.w.kana || q.w.jp, { rate: 0.85 });
        setTimeout(() => { cq.idx++; cq.locked = false; renderCompQuiz(); }, 1000);
      };
    });
  }

  function renderQuizHistory() {
    const box = $("#quizHistory");
    if (!box) return;
    if (!progress.quizHistory.length) {
      box.innerHTML = '<p class="muted">暂无记录。完成一轮测验后会显示在这里。</p>';
      return;
    }
    box.innerHTML = progress.quizHistory.map(h => {
      const d = new Date(h.date);
      const when = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return `<div class="hist-row"><span>综合测验 · ${h.total} 题</span><span><span class="score">${h.score} / ${h.total}</span>　<span class="when">${when}</span></span></div>`;
    }).join("");
  }

  function initQuiz() {
    $("#quizStart").onclick = () => { stopAll(); startQuiz(); };
    $("#resetProgress").onclick = () => {
      const yes = window.confirm("确定要清空全部学习进度吗？已完成课次、五十音正确率、错题本和测验记录都会删除，且无法恢复。");
      if (!yes) return;
      progress = defaultProgress();
      saveProgress();
      renderHome(); renderLessonList(); renderMistakes(); renderQuizHistory(); renderKanaGrid();
      $("#quizArea").innerHTML = '<p class="muted">进度已重置。可以从第 1 課重新开始。</p>';
      toast("学习进度已重置");
    };
  }

  /* ---------------- 播放条按钮 ---------------- */
  function initPlayer() {
    if (!$("#player")) return;
    $("#playerStop").onclick = stopAll;
    $("#playerReplay").onclick = () => { if (lastPlayed) speak(lastPlayed); };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initKana();
    initAnime();
    initQuiz();
    initPlayer();
    renderHome();
    renderLessonList();
    renderLesson(progress.lastLesson || 1);
    renderQuizHistory();
    go(location.hash.slice(1) || "home");

    // 记录首次访问日期，用于首页 DAY 计数
    if (!progress.firstSeen) { progress.firstSeen = todayStr(); saveProgress(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
