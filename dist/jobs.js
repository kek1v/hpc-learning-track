(() => {
  const endpoint = "https://boards-api.greenhouse.io/v1/boards/canonical/jobs?content=true";
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem("hpc.jobs." + key)) ?? fallback; }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem("hpc.jobs." + key, JSON.stringify(value)); } catch {} }
  };
  const topics = {
    "C++": /\bc\+\+/i,
    "Linux": /\blinux\b|\bubuntu\b/i,
    "Git": /\bgit\b/i,
    "Многопоточность": /multithread|multi-thread|thread safety|многопоточ/i,
    "OpenMP": /\bopenmp\b/i,
    "MPI": /\bmpi\b/i,
    "Оптимизация памяти": /memory optimi|cache local|cache coher|memory bandwidth|памят/i,
    "SIMD": /\bsimd\b|vectoriz|vectoris/i,
    "Профилирование": /profiling|профил/i
  };
  const junior = /junior|graduate|entry.level|early.career|internship/i;
  const remote = /remote|home.based/i;
  const engineering = /software engineer|kernel engineer|system programmer|systems engineer|hpc engineer/i;
  const hpc = /\bhpc\b|high.performance computing|supercomput|parallel computing/i;
  const parse = board => {
    const jobs = new Map();
    for (const job of board.jobs) {
      if (!remote.test(job.location.name) || !engineering.test(job.title)) continue;
      const description = job.content.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&");
      const entry = junior.test(job.title);
      if (!entry && (!hpc.test(description) || /\b(?:senior|staff|manager|principal|lead)\b/i.test(job.title))) continue;
      const section = description.match(/(?:what we are looking for in you|what we are looking for|what we look for|who you are)([\s\S]+?)(?=what we offer|benefits|about canonical|$)/i)?.[1];
      const key = "canonical-" + (job.internal_job_id || job.id);
      if (!jobs.has(key))
        jobs.set(key, {key, title: job.title.trim(), location: job.location.name, entry, url: "https://job-boards.greenhouse.io/canonical/jobs/" + Number(job.id), skills: Object.keys(topics).filter(name => topics[name].test(section || description)), requirements: Boolean(section)});
    }
    return [...jobs.values()].sort((a,b) => Number(b.entry) - Number(a.entry) || a.title.localeCompare(b.title));
  };
  if (typeof window === "undefined") { module.exports = parse; return; }
  const esc = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const source = "https://job-boards.greenhouse.io/canonical";
  let token = 0;
  window.renderJobs = async function(container, skills = []) {
    const active = ++token;
    let mode = "new", level = "junior", topic = "", details = "", loading = true, failed = false;
    let feed = store.get("feed", null);
    const seen = new Set(store.get("seen", []));
    const prep = new Set(store.get("prep", []));
    const mastered = name => skills.some(value => String(value).toLowerCase() === name.toLowerCase() || topics[name].test(value));
    const root = document.createElement("section");
    root.className = "jobs-ui";
    container.replaceChildren(root);
    const stamp = () => feed ? new Date(feed.checked).toLocaleString("ru-RU", {day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
    const labels = ["Собрать небольшой проект на C++ с CMake и тестами", "Опубликовать исходники и README на английском с инструкцией сборки", "Добавить в README замеры до и после оптимизации", "Подготовить резюме на английском и двухминутный рассказ о проекте"];
    function paint() {
      const rows = (feed?.rows || []).filter(j => (mode === "seen") === seen.has(j.key) && (level === "all" || j.entry) && (!topic || j.skills.includes(topic)));
      const card = job => {
        const score = job.skills.filter(mastered).length;
        const expanded = details === job.key;
        return '<article class="job-card"><div class="job-company"><span class="job-emblem" aria-hidden="true">C</span>Canonical · '+(job.entry ? "Начало карьеры":"Смежная роль")+'</div><h3>'+esc(job.title)+'</h3><p class="job-muted">'+esc(job.location)+'</p><div class="job-tags">'+job.skills.map(name => '<span>'+esc(name)+'</span>').join("")+'</div><div class="job-actions"><button data-detail="'+esc(job.key)+'" aria-expanded="'+expanded+'">'+(expanded?"Свернуть":"Сравнить навыки")+'</button><a href="'+esc(job.url)+'" data-open="'+esc(job.key)+'" target="_blank" rel="noopener noreferrer">Открыть вакансию ↗</a></div>'+(expanded ? '<div class="job-compare"><b>'+score+' из '+job.skills.length+' тем отмечено в вашем чек-листе</b><p>'+ (job.requirements ? 'Темы из требований и пожеланий работодателя.' : 'Темы, упомянутые в описании роли.')+' Полные условия, включая английский, опыт и регион найма, указаны в объявлении.</p>'+job.skills.map(name=>'<div><span>'+esc(name)+'</span><strong>'+ (mastered(name)?"Освоено":"В плане")+'</strong></div>').join("")+'</div>' : "")+'</article>';
      };
      root.innerHTML = '<div class="job-toolbar"><div class="job-tabs" aria-label="История вакансий"><button data-tab="new" aria-pressed="'+(mode==="new")+'">Новые</button><button data-tab="seen" aria-pressed="'+(mode==="seen")+'">Просмотренные</button></div><button data-refresh '+(loading?"disabled":"")+'>Обновить ↻</button></div><div class="job-filters"><select aria-label="Уровень вакансии" data-level><option value="junior">Junior и Graduate</option><option value="all">Включая смежные HPC-роли</option></select><select aria-label="Тема вакансии" data-topic><option value="">Все темы</option>'+Object.keys(topics).map(t=>'<option>'+esc(t)+'</option>').join("")+'</select></div><p class="job-meta" role="status">'+ (loading ? "Проверяем открытые вакансии…" : failed ? "Источник временно недоступен." : "Список обновлён.")+' '+ (feed ? "Последняя проверка "+esc(stamp())+". " : "")+'<a href="'+source+'" target="_blank" rel="noopener noreferrer">Canonical Careers ↗</a></p><div class="job-cards">'+(rows.length ? rows.map(card).join("") : '<div class="job-empty">'+(loading && !feed ? "Загружаем объявления…" : mode==="seen" ? "Здесь появятся вакансии, которые вы откроете." : "Для выбранных фильтров новых вакансий пока нет.")+'</div>')+'</div><details class="job-prep"><summary>Подготовка к отклику · '+prep.size+' / '+labels.length+'</summary>'+labels.map((label,i)=>'<label><input type="checkbox" data-prep="'+i+'" '+(prep.has(i)?"checked":"")+'>'+label+'</label>').join("")+'</details>';
      root.querySelector("[data-level]").value = level;
      root.querySelector("[data-topic]").value = topic;
    }
    async function refresh() {
      loading = true; failed = false; paint();
      if (!feed) {
        try {
          const r = await fetch(new URL("jobs-snapshot.json", document.baseURI));
          if (r.ok) feed = await r.json();
          if (token !== active) return;
          paint();
        } catch {}
      }
      try {
        const response = await fetch(endpoint, {signal: AbortSignal.timeout(15000)});
        if (!response.ok) throw Error();
        const rows = parse(await response.json());
        if (token !== active) return;
        feed = {rows, checked: new Date().toISOString()};
        store.set("feed", feed);
      } catch { failed = true; }
      loading = false;
      if (token === active) paint();
    }
    root.addEventListener("click", event => {
      const el = event.target.closest("button,a");
      if (!el) return;
      if (el.dataset.tab) {mode = el.dataset.tab; details = ""; paint();}
      if (el.dataset.detail) {details = details === el.dataset.detail ? "" : el.dataset.detail; paint();}
      if (el.hasAttribute("data-refresh")) refresh();
      if (el.dataset.open) {seen.add(el.dataset.open); store.set("seen", [...seen]); setTimeout(paint, 0);}
    });
    root.addEventListener("change", event => {
      const el = event.target;
      if (el.hasAttribute("data-level")) level = el.value;
      if (el.hasAttribute("data-topic")) topic = el.value;
      if (el.hasAttribute("data-prep")) {
        const i = Number(el.dataset.prep);
        if (el.checked) prep.add(i); else prep.delete(i);
        store.set("prep", [...prep]);
        root.querySelector(".job-prep summary").textContent = "Подготовка к отклику · "+prep.size+" / "+labels.length;
        return;
      }
      paint();
    });
    await refresh();
  };
  const style = document.createElement("style");
  style.textContent = `
  .jobs-ui {color:#252f28;font-family:inherit}
  .jobs-ui button,.jobs-ui select {font:inherit;border:1px solid #d9ded5;color:#2d392e;background:white;border-radius:8px;cursor:pointer;padding:9px 13px}
  .job-toolbar,.job-filters,.job-actions,.job-tabs,.job-tags,.job-company {display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .job-toolbar {justify-content:space-between;margin-bottom:15px}.job-tabs {background:#e9ece4;padding:4px;gap:2px;border-radius:10px}
  .job-tabs button {border:0;background:transparent;color:#60705e}.job-tabs button[aria-pressed=true]{background:white;color:#253127;box-shadow:0 1px 3px #28302117}
  .job-filters select,.job-toolbar button,.job-actions {font-size:13px}.jobs-ui button:disabled{opacity:.6;cursor:wait}
  .job-meta,.job-muted,.job-compare p {color:#5d695e;font-size:13px;line-height:1.5}.jobs-ui a{color:#4b6344;text-underline-offset:3px}
  .job-cards {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr));gap:14px;align-items:start}
  .job-card,.job-prep,.job-empty {padding:21px;border-radius:13px;background:white;border:1px solid #dce1d7}.job-card h3{font-size:19px;line-height:1.35;margin:14px 0 6px;color:#243026;font-weight:650}
  .job-company{color:#5e6c5e;font-weight:600;font-size:12px}.job-emblem{display:inline-grid;place-items:center;color:white;background:#d66739;border-radius:6px;width:24px;height:24px;font-weight:750}
  .job-muted{margin:0 0 14px}.job-tags>span{padding:4px 9px;font-size:12px;border-radius:6px;color:#425a37;background:#edf2e6}.job-actions{margin-top:18px;justify-content:space-between}
  .job-compare{border-top:1px solid #dae0d6;margin-top:15px;padding-top:15px;font-size:13px}.job-compare>div{display:flex;justify-content:space-between;padding:5px 0}.job-compare strong{color:#556c49}
  .job-prep{margin-top:20px}.job-prep summary{cursor:pointer;font-weight:650}.job-prep label{display:flex;align-items:center;gap:9px;color:#495548;margin-top:15px;font-size:14px}.job-prep input{accent-color:#6b815b}
  `;
  document.head.append(style);
})();

