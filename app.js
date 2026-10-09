(() => {
  // ---------- constants ----------
  const START = "2026-10-11", P1 = "2026-12-11", P2 = "2027-03-12";
  const PHASES = { 1: { end: P1, mkey: "m1" }, 2: { end: P2, mkey: "m2" } };
  const MEAS = [
    { key: "m0", date: START, label: "Inicial · 11 oct", long: "Medición inicial · 11 oct 2026" },
    { key: "m1", date: P1, label: "Cierre F1 · 11 dic", long: "Cierre Fase 1 · 11 dic 2026" },
    { key: "m2", date: P2, label: "Cierre F2 · 12 mar", long: "Cierre Fase 2 · 12 mar 2027" },
  ];
  const W = { fat: 30, meas: 20, weight: 15, sessions: 20, steps: 15 };
  const GOAL_SESS = 4, GOAL_STEPS = 8000, MAX_PEOPLE = 10;
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  // DB column <-> form field
  const MCOL = { weight: "peso_kg", fatScale: "grasa_bascula", neck: "cuello_cm", waist: "cintura_cm", hip: "cadera_cm", arm: "brazo_cm", thigh: "muslo_cm" };
  const MF = Object.keys(MCOL);

  const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
  const fmtD = s => { const [, m, d] = s.split("-"); return (+d) + " " + MESES[+m - 1]; };
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  let today = todayStr();
  const WEEKS = []; for (let m = "2026-10-12"; m < P2; m = addDays(m, 7)) WEEKS.push({ key: m, end: addDays(m, 6) < P2 ? addDays(m, 6) : P2 });
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = id => document.getElementById(id);
  const num = v => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
  const nn = v => v == null ? null : Number(v);
  const f1 = n => (Math.round(n * 10) / 10).toLocaleString("es-GT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ---------- state ----------
  const S = { people: new Map(), meas: new Map(), logs: new Map(), phase: 1, mView: "m0", me: null, myEmail: "", editP: null, selCell: null };
  const isAdmin = () => !!(S.me && S.me.admin);
  const canEditP = pid => isAdmin() || (S.me && S.me.id === pid);

  // ---------- Supabase ----------
  const cfg = window.RETO_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    $("setupMsg").hidden = false; $("loginForm").hidden = true; return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  async function loadAll() {
    const [p, m, l] = await Promise.all([
      sb.from("participantes").select("*"),
      sb.from("mediciones").select("*"),
      sb.from("semanas").select("*").limit(5000),
    ]);
    if (p.error || m.error || l.error) throw (p.error || m.error || l.error);
    S.people = new Map(p.data.map(r => [r.id, { name: r.nombre, email: r.email, sex: r.sexo, height: Number(r.estatura_cm), admin: r.es_admin }]));
    S.meas = new Map(m.data.map(r => { const o = {}; MF.forEach(f => o[f] = nn(r[MCOL[f]])); return [r.participante_id + "__" + r.corte, o]; }));
    S.logs = new Map(l.data.map(r => [r.participante_id + "__" + r.semana, { sessions: r.sesiones, steps: r.pasos }]));
    S.me = null;
    for (const [id, p2] of S.people) if (p2.email === S.myEmail) S.me = { id, ...p2 };
  }

  // ---------- auth screens ----------
  function showAuth(mode, msg) {
    $("app").hidden = true; $("auth").hidden = false;
    $("loginForm").hidden = mode !== "login";
    $("newPassForm").hidden = mode !== "newpass";
    $("notMember").hidden = mode !== "notmember";
    if (mode === "notmember") $("notMember").innerHTML = `El correo <b>${esc(S.myEmail)}</b> no está inscrito en el reto. Pide a quien lo organiza que te agregue con este correo.<br><br><button class="btn ghost" type="button" id="nmOut">Salir</button>`;
    if (msg) $("lMsg").textContent = msg;
  }
  async function enter(session) {
    S.myEmail = (session.user.email || "").toLowerCase();
    try { await loadAll(); } catch (e) { showAuth("login", "No se pudieron cargar los datos. Intenta de nuevo."); return; }
    if (!S.me) { showAuth("notmember"); return; }
    const already = !$("app").hidden;
    $("auth").hidden = true; $("app").hidden = false;
    renderAll(already);
  }
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault(); $("lBtn").disabled = true; $("lMsg").style.color = "var(--muted)"; $("lMsg").textContent = "Entrando…";
    const { error } = await sb.auth.signInWithPassword({ email: $("lEmail").value.trim().toLowerCase(), password: $("lPass").value });
    $("lBtn").disabled = false;
    if (error) { $("lMsg").style.color = "var(--heat)"; $("lMsg").textContent = /confirm/i.test(error.message) ? "Tu correo aún no está confirmado. Revisa tu bandeja." : "Correo o contraseña incorrectos."; }
    else $("lMsg").textContent = "";
  });
  $("forgot").addEventListener("click", async () => {
    const email = $("lEmail").value.trim().toLowerCase();
    if (!email) { $("lMsg").style.color = "var(--heat)"; $("lMsg").textContent = "Escribe tu correo arriba y vuelve a tocar aquí."; $("lEmail").focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $("lMsg").style.color = error ? "var(--heat)" : "var(--ok)";
    $("lMsg").textContent = error ? "No se pudo enviar el correo. Intenta en unos minutos." : "Te enviamos un correo con el enlace para crear una contraseña nueva.";
  });
  $("newPassForm").addEventListener("submit", async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $("npPass").value });
    if (error) { $("npMsg").style.color = "var(--heat)"; $("npMsg").textContent = "No se pudo guardar: " + error.message; return; }
    $("npPass").value = ""; $("newPassForm").hidden = true;
    const { data } = await sb.auth.getSession(); if (data.session) enter(data.session);
  });
  $("npCancel").addEventListener("click", () => { $("auth").hidden = true; $("app").hidden = false; });
  document.addEventListener("click", async e => {
    if (e.target.closest("#nmOut") || e.target.closest("#logout")) { await sb.auth.signOut(); showAuth("login", ""); }
    if (e.target.closest("#chpass")) { showAuth("newpass"); $("npTitle").textContent = "Cambiar contraseña"; $("npCancel").hidden = false; }
  });

  let recovering = false;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { recovering = true; showAuth("newpass"); return; }
    if (event === "SIGNED_OUT") { showAuth("login"); return; }
    if (event === "SIGNED_IN" && session && !recovering) setTimeout(() => enter(session), 0);
  });
  sb.auth.getSession().then(({ data }) => { if (data.session && !recovering) enter(data.session); else if (!recovering) showAuth("login"); });

  // refresh data every minute while visible
  setInterval(async () => {
    if (document.hidden || $("app").hidden) return;
    today = todayStr();
    try { await loadAll(); renderAll(true); } catch (e) {}
  }, 60000);

  // ---------- body-fat formula (US Navy, cm) ----------
  function navy(p, m) {
    if (!p || !m || !p.height || !m.neck || !m.waist) return null;
    let v;
    if (p.sex === "M") { if (m.waist - m.neck <= 0) return null; v = 495 / (1.0324 - 0.19077 * Math.log10(m.waist - m.neck) + 0.15456 * Math.log10(p.height)) - 450; }
    else { if (!m.hip || m.waist + m.hip - m.neck <= 0) return null; v = 495 / (1.29579 - 0.35004 * Math.log10(m.waist + m.hip - m.neck) + 0.221 * Math.log10(p.height)) - 450; }
    return isFinite(v) && v > 2 && v < 70 ? v : null;
  }

  // ---------- scoring ----------
  function phaseWeeks(ph) { const end = PHASES[ph].end; return WEEKS.filter(w => w.key <= end).map(w => ({ key: w.key, end: w.end < end ? w.end : end })); }
  function score(ph) {
    const mkey = PHASES[ph].mkey;
    const counted = phaseWeeks(ph).filter(w => w.end < today);
    const rows = [...S.people.entries()].map(([pid, p]) => {
      const a = S.meas.get(pid + "__m0"), b = S.meas.get(pid + "__" + mkey);
      const r = { pid, p, fat: null, meas: null, weight: null, sess: null, steps: null };
      if (a && b) {
        const ds = [];
        if (a.fatScale != null && b.fatScale != null) ds.push(a.fatScale - b.fatScale);
        const na = navy(p, a), nb = navy(p, b);
        if (na != null && nb != null) ds.push(na - nb);
        if (ds.length) r.fat = ds.reduce((x, y) => x + y, 0) / ds.length;
        if (a.waist && a.hip && b.waist && b.hip) r.meas = ((a.waist + a.hip) - (b.waist + b.hip)) / (a.waist + a.hip) * 100;
        if (a.weight && b.weight) r.weight = (a.weight - b.weight) / a.weight * 100;
      }
      if (counted.length) {
        let s = 0, st = 0;
        counted.forEach(w => { const l = S.logs.get(pid + "__" + w.key); if (l) { s += Math.min(l.sessions || 0, GOAL_SESS); st += Math.min((l.steps || 0) / GOAL_STEPS, 1); } });
        r.sess = s / (GOAL_SESS * counted.length); r.steps = st / counted.length;
      }
      return r;
    });
    const maxOf = k => Math.max(0, ...rows.map(r => r[k] ?? 0));
    const mx = { fat: maxOf("fat"), meas: maxOf("meas"), weight: maxOf("weight") };
    rows.forEach(r => {
      r.pts = {};
      ["fat", "meas", "weight"].forEach(k => { r.pts[k] = r[k] == null ? null : (mx[k] > 0 ? W[k] * Math.max(0, r[k]) / mx[k] : 0); });
      r.pts.sess = r.sess == null ? null : W.sessions * r.sess;
      r.pts.steps = r.steps == null ? null : W.steps * r.steps;
      r.adh = (r.pts.sess || 0) + (r.pts.steps || 0);
      r.total = Object.values(r.pts).reduce((x, y) => x + (y || 0), 0);
    });
    rows.sort((x, y) => y.total - x.total || y.adh - x.adh || x.p.name.localeCompare(y.p.name));
    return { rows, counted: counted.length, totalWeeks: phaseWeeks(ph).length };
  }

  // ---------- header ----------
  function renderHeader() {
    const total = daysBetween(START, P2), pct = d => Math.max(0, Math.min(100, daysBetween(START, d) / total * 100));
    const t = pct(today);
    $("rail").innerHTML = `<div class="fill" style="width:${t}%"></div>` +
      MEAS.map(m => `<div class="node${today >= m.date ? " done" : ""}" style="left:${pct(m.date)}%"></div>`).join("") +
      (today > START && today < P2 ? `<div class="today" style="left:${t}%" title="Hoy"></div>` : "");
    $("labels").innerHTML = MEAS.map((m, i) => `<div style="left:${pct(m.date)}%"><b>${["Inicio", "Fase 1", "Fase 2"][i]}</b><span class="muted">${fmtD(m.date)}</span></div>`).join("");
    let txt;
    if (today < START) { const n = daysBetween(today, START); txt = n === 1 ? "Mañana es la medición inicial" : `Faltan ${n} días para la medición inicial`; }
    else if (today === START) txt = "Hoy es la medición inicial";
    else if (today < P1) txt = `${daysBetween(today, P1)} días para cerrar la Fase 1`;
    else if (today === P1) txt = "Hoy cierra la Fase 1";
    else if (today < P2) txt = `${daysBetween(today, P2)} días para cerrar la Fase 2`;
    else if (today === P2) txt = "Hoy es la medición final";
    else txt = "Reto terminado";
    $("countdown").textContent = txt;
    $("userbar").innerHTML = `<span>Hola, <b>${esc(S.me ? S.me.name : "")}</b>${isAdmin() ? ' <span class="chip">Admin</span>' : ""}</span><button class="linkbtn" type="button" id="chpass">Cambiar contraseña</button><button class="linkbtn" type="button" id="logout">Salir</button>`;
  }

  function renderBanners() {
    $("banners").innerHTML = isAdmin() ? "" : `<div class="banner info">Puedes registrar y corregir tus propias semanas y mediciones. Lo de los demás lo ves pero no lo puedes cambiar.</div>`;
    $("pFormCard").hidden = !isAdmin();
  }

  // ---------- ranking ----------
  const people = () => [...S.people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  function cell(pts, raw) {
    if (pts == null) return `<td><span class="pend">pendiente</span></td>`;
    return `<td><span class="pts">${f1(pts)}</span><span class="raw">${raw}</span></td>`;
  }
  const signed = (v, u) => (v > 0 ? "−" : v < 0 ? "+" : "") + f1(Math.abs(v)) + u;
  function renderRanking() {
    document.querySelectorAll("#phaseSeg button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.phase === S.phase)));
    const ph = PHASES[S.phase];
    $("phaseStatus").innerHTML = today < START ? `<span class="chip">Inicia el 11 oct</span>` : today <= ph.end ? `<span class="chip heat">En curso · cierra ${fmtD(ph.end)}</span>` : `<span class="chip ok">Cerrada</span>`;
    if (!S.people.size) { $("rankBody").innerHTML = `<div class="empty"><h3>Aún no hay participantes</h3></div>`; return; }
    const { rows, counted, totalWeeks } = score(S.phase);
    const maxT = Math.max(1, ...rows.map(r => r.total));
    const note = `<p class="muted" style="font-size:.85rem">Constancia: ${counted} de ${totalWeeks} semanas contadas. Composición corporal: se calcula con la medición del ${fmtD(ph.end)}${today < ph.end ? ", por eso aún aparece pendiente" : ""}.</p>`;
    $("rankBody").innerHTML = note + `<div class="scroll"><table>
      <thead><tr><th>#</th><th>Participante</th><th>Grasa · ${W.fat}</th><th>Medidas · ${W.meas}</th><th>Peso · ${W.weight}</th><th>Sesiones · ${W.sessions}</th><th>Pasos · ${W.steps}</th><th>Total</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i === 0 && r.total > 0 ? "lead" : ""}">
        <td class="pos">${i + 1}</td>
        <td class="pname">${esc(r.p.name)}</td>
        ${cell(r.pts.fat, r.fat == null ? "" : signed(r.fat, " pp"))}
        ${cell(r.pts.meas, r.meas == null ? "" : signed(r.meas, " %"))}
        ${cell(r.pts.weight, r.weight == null ? "" : signed(r.weight, " %"))}
        ${cell(r.pts.sess, r.sess == null ? "" : Math.round(r.sess * 100) + " % meta")}
        ${cell(r.pts.steps, r.steps == null ? "" : Math.round(r.steps * 100) + " % meta")}
        <td><div class="total"><span class="bar"><i style="width:${r.total / maxT * 100}%"></i></span><b>${f1(r.total)}</b></div></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  // ---------- weekly ----------
  function currentWeekKey() { if (today < WEEKS[0].key) return WEEKS[0].key; const w = [...WEEKS].reverse().find(w => w.key <= today); return (w || WEEKS[WEEKS.length - 1]).key; }
  function fillSelect(sel, opts, keep) { const v = keep ?? sel.value; sel.innerHTML = opts.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join(""); if (opts.some(o => o.v === v)) sel.value = v; }
  const editablePeople = () => people().filter(([id]) => canEditP(id));
  function renderLogForm(keepFields) {
    const before = $("logP").value;
    fillSelect($("logP"), editablePeople().map(([id, p]) => ({ v: id, t: p.name })), before || (S.me && S.me.id));
    if (!$("logW").options.length) fillSelect($("logW"), WEEKS.map((w, i) => ({ v: w.key, t: `Semana ${i + 1} · ${fmtD(w.key)} – ${fmtD(w.end)}` })), currentWeekKey());
    if (!keepFields) loadLog();
  }
  function loadLog() {
    const l = S.logs.get($("logP").value + "__" + $("logW").value);
    $("logS").value = l ? l.sessions : ""; $("logSteps").value = l ? l.steps : "";
    S.selCell = $("logP").value + "__" + $("logW").value; markSel();
  }
  function cellState(l, w) {
    if (!l) return w.end < today ? "miss" : "future";
    const a = (l.sessions || 0) >= GOAL_SESS, b = (l.steps || 0) >= GOAL_STEPS;
    return a && b ? "full" : a || b ? "half" : "low";
  }
  function streak(pid) { let n = 0; const done = WEEKS.filter(w => w.end < today).reverse(); for (const w of done) { const l = S.logs.get(pid + "__" + w.key); if (l && l.sessions >= GOAL_SESS) n++; else break; } return n; }
  function renderGrid() {
    const ps = people();
    if (!ps.length) { $("wgrid").innerHTML = `<p class="muted">Sin participantes todavía.</p>`; $("wgrid").style.gridTemplateColumns = ""; return; }
    $("wgrid").style.gridTemplateColumns = `minmax(90px,140px) repeat(${WEEKS.length},30px) 54px`;
    let h = `<div></div>` + WEEKS.map((w, i) => `<div class="hd" title="${fmtD(w.key)} – ${fmtD(w.end)}">${i + 1}</div>`).join("") + `<div class="hd">Racha</div>`;
    ps.forEach(([pid, p]) => {
      h += `<div class="nm" title="${esc(p.name)}">${esc(p.name)}</div>`;
      WEEKS.forEach((w, i) => { const l = S.logs.get(pid + "__" + w.key); const s = cellState(l, w);
        h += `<button type="button" class="cell ${s}" data-p="${esc(pid)}" data-w="${w.key}" aria-label="${esc(p.name)}, semana ${i + 1}" ${canEditP(pid) ? "" : 'tabindex="-1" style="cursor:default"'}>${l ? l.sessions : ""}</button>`; });
      const k = streak(pid); h += `<div class="hd" style="align-self:center">${k ? `<span class="chip heat">${k} sem</span>` : "–"}</div>`;
    });
    $("wgrid").innerHTML = h; markSel();
  }
  function markSel() { document.querySelectorAll(".cell.sel").forEach(c => c.classList.remove("sel")); if (!S.selCell) return; const [p, w] = S.selCell.split("__"); const c = document.querySelector(`.cell[data-p="${CSS.escape(p)}"][data-w="${w}"]`); if (c) c.classList.add("sel"); }

  // ---------- measurements ----------
  function renderMForm(keepFields) {
    const before = $("mP").value;
    fillSelect($("mP"), editablePeople().map(([id, p]) => ({ v: id, t: p.name })), before || (S.me && S.me.id));
    if (!$("mK").options.length) fillSelect($("mK"), MEAS.map(m => ({ v: m.key, t: m.long })), today >= P2 ? "m2" : today >= P1 ? "m1" : "m0");
    if (!keepFields) loadM();
  }
  function loadM() { const m = S.meas.get($("mP").value + "__" + $("mK").value); MF.forEach(f => $("m_" + f).value = m && m[f] != null ? m[f] : ""); calcM(); }
  function formM() { const o = {}; MF.forEach(f => o[f] = num($("m_" + f).value)); return o; }
  function calcM() {
    const p = S.people.get($("mP").value), m = formM(), n = navy(p, m);
    const avg = n != null && m.fatScale != null ? (n + m.fatScale) / 2 : n ?? m.fatScale;
    const imc = p && m.weight ? m.weight / Math.pow(p.height / 100, 2) : null;
    $("mCalc").innerHTML = `<div><span class="eyebrow">% grasa cinta</span><b>${n == null ? "–" : f1(n) + "%"}</b></div><div><span class="eyebrow">% grasa usado</span><b>${avg == null ? "–" : f1(avg) + "%"}</b></div><div><span class="eyebrow">IMC</span><b>${imc == null ? "–" : f1(imc)}</b></div>` +
      (p && n == null && (m.neck || m.waist) ? `<p class="muted" style="font-size:.8rem;flex-basis:100%">Para la fórmula con cinta faltan: cuello, cintura${p.sex === "F" ? ", cadera" : ""}.</p>` : "");
  }
  function renderMTable() {
    $("mViewSeg").innerHTML = MEAS.map(m => `<button type="button" data-mv="${m.key}" aria-pressed="${S.mView === m.key}">${m.label}</button>`).join("");
    const ps = people();
    if (!ps.length) { $("mTable").innerHTML = `<p class="muted">Sin participantes todavía.</p>`; return; }
    const rows = ps.map(([pid, p]) => { const m = S.meas.get(pid + "__" + S.mView); const n = navy(p, m);
      const v = x => x == null ? `<span class="pend">–</span>` : f1(x);
      return `<tr><td class="pname" colspan="2">${esc(p.name)}</td><td>${v(m?.weight)}</td><td>${v(m?.fatScale)}</td><td>${v(n)}</td><td>${v(m?.waist)}</td><td>${v(m?.hip)}</td><td>${v(m?.neck)}</td></tr>`; }).join("");
    $("mTable").innerHTML = `<table><thead><tr><th colspan="2">Participante</th><th>Peso kg</th><th>Grasa báscula</th><th>Grasa cinta</th><th>Cintura</th><th>Cadera</th><th>Cuello</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- people ----------
  function renderPeople() {
    const ps = people();
    $("pCount").textContent = `${ps.length} / ${MAX_PEOPLE}`;
    $("plist").innerHTML = ps.map(([id, p]) => {
      const has0 = S.meas.has(id + "__m0");
      return `<div class="pitem"><div><div class="pname">${esc(p.name)}${p.admin ? ' <span class="chip">Admin</span>' : ""}</div><div class="meta">${p.sex === "M" ? "Hombre" : "Mujer"} · ${p.height} cm${isAdmin() ? " · " + esc(p.email) : ""} · ${has0 ? '<span class="chip ok">Medición inicial lista</span>' : '<span class="chip">Sin medición inicial</span>'}</div></div>
      ${isAdmin() ? `<div class="row"><button class="btn ghost" type="button" data-edit="${esc(id)}">Editar</button>${id === S.me.id ? "" : `<button class="btn ghost" type="button" data-del="${esc(id)}">Quitar</button>`}</div>` : ""}</div>`;
    }).join("");
  }

  function renderWeights() {
    const items = [["% de grasa corporal", W.fat, ""], ["Medidas (cintura + cadera)", W.meas, ""], ["Peso", W.weight, ""], ["Sesiones de ejercicio", W.sessions, "adh"], ["Pasos diarios", W.steps, "adh"]];
    $("weights").innerHTML = items.map(([t, w, c]) => `<div class="wrow ${c}"><span>${t}</span><span class="bar"><i style="width:${w / 30 * 100}%"></i></span><b class="num" style="font-size:1.3rem;text-align:right">${w}</b></div>`).join("") +
      `<p class="muted" style="font-size:.85rem">Azul: composición corporal. Naranja: constancia.</p>`;
  }

  // keepFields: on background refresh, don't overwrite what the person is typing
  function renderAll(keepFields) { renderHeader(); renderBanners(); renderRanking(); renderLogForm(keepFields); renderGrid(); renderMForm(keepFields); renderMTable(); renderPeople(); }

  // ---------- writes ----------
  async function write(fn, toastEl, okMsg) {
    const { error } = await fn();
    if (error) {
      const msg = error.code === "42501" || /row-level security/i.test(error.message) ? "No tienes permiso para cambiar ese dato." : error.code === "23505" ? "Ese correo ya está inscrito." : error.code === "23514" ? "Algún valor está fuera de rango. Revísalo." : "No se guardó. Revisa tu conexión e inténtalo de nuevo.";
      flash(toastEl, msg, true); return false;
    }
    try { await loadAll(); } catch (e) {}
    renderAll(true); flash(toastEl, okMsg); return true;
  }
  function flash(el, msg, bad) { el.textContent = msg; el.style.color = bad ? "var(--heat)" : "var(--ok)"; clearTimeout(el._t); el._t = setTimeout(() => el.textContent = "", 4000); }

  // ---------- events ----------
  document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => goto(b.dataset.tab)));
  function goto(tab) {
    document.querySelectorAll("nav.tabs button").forEach(x => x.setAttribute("aria-selected", String(x.dataset.tab === tab)));
    document.querySelectorAll("section.panel").forEach(s => s.hidden = s.id !== "tab-" + tab);
    try { localStorage.setItem("reto-tab", tab); } catch (e) {}
  }
  $("phaseSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; S.phase = +b.dataset.phase; renderRanking(); });

  $("logP").addEventListener("change", loadLog); $("logW").addEventListener("change", loadLog);
  $("wgrid").addEventListener("click", e => { const c = e.target.closest(".cell"); if (!c || !canEditP(c.dataset.p)) return; $("logP").value = c.dataset.p; $("logW").value = c.dataset.w; loadLog(); $("logS").focus(); });
  $("logForm").addEventListener("submit", async e => { e.preventDefault();
    const pid = $("logP").value, wk = $("logW").value; if (!pid) return;
    const sesiones = Math.max(0, Math.min(7, Math.round(num($("logS").value) ?? 0))), pasos = Math.max(0, Math.min(60000, Math.round(num($("logSteps").value) ?? 0)));
    $("logBtn").disabled = true;
    await write(() => sb.from("semanas").upsert({ participante_id: pid, semana: wk, sesiones, pasos, updated_at: new Date().toISOString() }, { onConflict: "participante_id,semana" }), $("logToast"), "Semana guardada");
    $("logBtn").disabled = false;
  });

  $("mP").addEventListener("change", loadM); $("mK").addEventListener("change", loadM);
  MF.forEach(f => $("m_" + f).addEventListener("input", calcM));
  $("mForm").addEventListener("submit", async e => { e.preventDefault();
    const pid = $("mP").value, k = $("mK").value; if (!pid) return;
    const row = { participante_id: pid, corte: k, updated_at: new Date().toISOString() }; const v = formM();
    MF.forEach(f => row[MCOL[f]] = v[f]);
    $("mBtn").disabled = true;
    await write(() => sb.from("mediciones").upsert(row, { onConflict: "participante_id,corte" }), $("mToast"), "Medición guardada");
    $("mBtn").disabled = false;
  });
  $("mViewSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; S.mView = b.dataset.mv; renderMTable(); });

  function resetPForm() { S.editP = null; $("pForm").reset(); $("pFormTitle").textContent = "Agregar participante"; $("pBtn").textContent = "Agregar"; $("pCancel").hidden = true; $("pEmail").disabled = false; }
  $("pCancel").addEventListener("click", resetPForm);
  $("pForm").addEventListener("submit", async e => { e.preventDefault();
    const nombre = $("pName").value.trim(), email = $("pEmail").value.trim().toLowerCase(), sexo = $("pSex").value, estatura_cm = num($("pHeight").value);
    // an admin can't remove their own admin access by accident
    const es_admin = $("pAdmin").checked || (S.editP && S.editP === S.me.id);
    if (!nombre || !email || !estatura_cm) return;
    if (!S.editP && S.people.size >= MAX_PEOPLE) { flash($("pToast"), `El reto es de ${MAX_PEOPLE} personas.`, true); return; }
    const editing = S.editP;
    const ok = await write(() => editing
      ? sb.from("participantes").update({ nombre, email, sexo, estatura_cm, es_admin }).eq("id", editing)
      : sb.from("participantes").insert({ nombre, email, sexo, estatura_cm, es_admin }),
      $("pToast"), editing ? "Cambios guardados" : "Participante agregado");
    if (ok) resetPForm();
  });
  $("plist").addEventListener("click", async e => {
    const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]"), yes = e.target.closest("[data-yes]"), no = e.target.closest("[data-no]");
    if (ed) { const id = ed.dataset.edit, p = S.people.get(id); S.editP = id; $("pName").value = p.name; $("pEmail").value = p.email; $("pSex").value = p.sex; $("pHeight").value = p.height; $("pAdmin").checked = !!p.admin; $("pFormTitle").textContent = "Editar participante"; $("pBtn").textContent = "Guardar cambios"; $("pCancel").hidden = false; $("pName").focus(); }
    if (del) { const box = del.parentElement; box.innerHTML = `<span class="muted" style="font-size:.85rem">¿Quitar del reto? Se borran sus registros.</span><button class="btn danger" type="button" data-yes="${esc(del.dataset.del)}">Sí, quitar</button><button class="btn ghost" type="button" data-no="1">No</button>`; }
    if (no) renderPeople();
    if (yes) await write(() => sb.from("participantes").delete().eq("id", yes.dataset.yes), $("pToast"), "Participante quitado");
  });

  try { const t = localStorage.getItem("reto-tab"); if (t && $("tab-" + t)) goto(t); } catch (e) {}
  renderWeights();
})();
