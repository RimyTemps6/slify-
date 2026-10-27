import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getFirestore,collection,doc,setDoc,getDoc,deleteDoc,addDoc,getDocs,query,orderBy,limit,writeBatch} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ===== CONFIGURAÇÃO ===== */
const firebaseConfig = {
  apiKey: "AIzaSyC7oveo-af8gkSO3zbaKIlX0JIvFP47Yr0",
  authDomain: "slify-ef128.firebaseapp.com",
  projectId: "slify-ef128",
  storageBucket: "slify-ef128.firebasestorage.app",
  messagingSenderId: "206220562373",
  appId: "1:206220562373:web:48ae302e1fee142a3685ac"
};
let YT_KEY = ""; try { YT_KEY = localStorage.getItem("slify_yt_key") || ""; } catch (e) {}
/* ======================== */

const app = initializeApp(firebaseConfig), db = getFirestore(app);
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = s => isFinite(s) && s > 0 ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "0:00";
let tab = "new", queue = [], idx = -1, favs = new Set(), mode = "audio", yt, ytReady = false, ytState = -1;
const audio = new Audio();
const col = n => collection(db, "slify", "me", n);

function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }

function jsonp(url) {
  return new Promise((ok, fail) => {
    const cb = "dz" + Math.random().toString(36).slice(2), s = document.createElement("script");
    const t = setTimeout(() => { s.remove(); fail(new Error("timeout")); }, 12000);
    window[cb] = d => { clearTimeout(t); ok(d); s.remove(); delete window[cb]; };
    s.onerror = () => { clearTimeout(t); fail(new Error("erro")); };
    s.src = url + (url.includes("?") ? "&" : "?") + "output=jsonp&callback=" + cb;
    document.body.appendChild(s);
  });
}

/* ----- lançamentos: busca e salva no Firestore sozinho (cria as coleções automaticamente) ----- */
async function syncReleases() {
  let list = [];
  for (const u of ["editorial/0/releases?limit=50", "chart/0/albums?limit=50"]) {
    try { const r = await jsonp("https://api.deezer.com/" + u); list = r.data || []; } catch (e) {}
    if (list.length) break;
  }
  if (!list.length) return;
  const today = new Date().toISOString().slice(0, 10), b = writeBatch(db);
  list.forEach(a => b.set(doc(db, "slify", "me", "albums", String(a.id)), {
    id: String(a.id), title: a.title || "", artist: a.artist?.name || "",
    cover: a.cover_big || a.cover_medium || "", date: a.release_date || today
  }, {merge: true}));
  try { await b.commit(); } catch (e) { console.error(e); }
}

/* ----- telas ----- */
$$("nav button[data-tab]").forEach(b => b.onclick = () => go(b.dataset.tab));
async function go(t) {
  tab = t;
  $$("nav button[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  const v = $("#view"); v.innerHTML = '<p class="empty">Carregando…</p>';
  try {
    if (t === "search") {
      v.innerHTML = '<input id="q" class="search" type="search" placeholder="O que você quer ouvir?" autocomplete="off"><div id="res"><p class="empty">Digite uma música ou artista.</p></div>';
      const q = $("#q"); let tm;
      const run = async () => {
        const s = q.value.trim(); if (!s) return;
        $("#res").innerHTML = '<p class="empty">Buscando…</p>';
        try {
          const r = await jsonp("https://api.deezer.com/search?limit=40&q=" + encodeURIComponent(s));
          showTracks((r.data || []).map(x => ({id: String(x.id), title: x.title, artist: x.artist?.name || "", cover: x.album?.cover_big || x.album?.cover_medium || "", preview: x.preview || "", album: x.album?.title || ""})), "Nada encontrado. Tente outro nome.", false, "#res");
        } catch (e) { $("#res").innerHTML = '<p class="empty">Erro na busca. Tente de novo.</p>'; }
      };
      q.oninput = () => { clearTimeout(tm); tm = setTimeout(run, 500); };
      q.onkeydown = e => { if (e.key === "Enter") { clearTimeout(tm); run(); } };
      q.focus();
      return;
    }
    if (t === "new") {
      const s = await getDocs(query(col("albums"), orderBy("date", "desc"), limit(60)));
      const arr = s.docs.map(d => d.data());
      v.innerHTML = '<h2 style="margin-bottom:14px">Novidades</h2>' + (arr.length ? '<div class="grid">' + arr.map((a, i) =>
        `<button class="album" data-i="${i}"><img src="${esc(a.cover)}" alt="" loading="lazy"><b>${esc(a.title)}</b><span>${esc(a.artist)}</span></button>`).join("") + "</div>"
        : '<p class="empty">Nenhum lançamento encontrado. Verifique a conexão e recarregue.</p>');
      v.querySelectorAll(".album").forEach(b => b.onclick = () => openAlbum(arr[b.dataset.i]));
    } else {
      const s = await getDocs(query(col(t === "favs" ? "favorites" : "history"), orderBy("at", "desc"), limit(100)));
      showTracks(s.docs.map(d => d.data()), t === "favs" ? "Toque no ♡ de uma música para salvar aqui." : "As músicas que você ouvir aparecem aqui.");
    }
  } catch (e) { v.innerHTML = '<p class="empty">Erro ao carregar: ' + esc(e.code || e.message) + "</p>"; }
}
async function openAlbum(a) {
  const v = $("#view"); v.innerHTML = '<p class="empty">Abrindo álbum…</p>';
  try {
    const r = await jsonp(`https://api.deezer.com/album/${a.id}/tracks?limit=50`);
    const tr = (r.data || []).map(t => ({id: String(t.id), title: t.title, artist: t.artist?.name || a.artist, cover: a.cover, preview: t.preview || "", album: a.title}));
    showTracks(tr, "Este álbum não tem faixas disponíveis.", true);
  } catch (e) { v.innerHTML = '<button class="back" id="bk">‹ Voltar</button><p class="empty">Não foi possível abrir o álbum.</p>'; $("#bk").onclick = () => go("new"); }
}
function showTracks(arr, emptyMsg, back, target = "#view") {
  const v = $(target);
  v.innerHTML = (back ? '<button class="back" id="bk">‹ Voltar</button>' : "") + (arr.length ? arr.map((t, i) =>
    `<button class="row" data-i="${i}"><img src="${esc(t.cover)}" alt=""><div class="t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div></button>`).join("") : `<p class="empty">${emptyMsg}</p>`);
  if (back) $("#bk").onclick = () => go("new");
  v.querySelectorAll(".row").forEach(b => b.onclick = () => { queue = arr; playAt(+b.dataset.i); });
}

/* ----- player ----- */
function stop() { audio.pause(); if (ytReady) try { yt.stopVideo(); } catch (e) {} }
async function ytSearch(t) {
  const k = "slify_yt_" + t.id;
  try { const c = localStorage.getItem(k); if (c) return c; } catch (e) {}
  try {
    const q = encodeURIComponent(`${t.artist} ${t.title} audio`);
    const r = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${q}&key=${YT_KEY}`)).json();
    const id = r.items?.[0]?.id?.videoId;
    if (id) try { localStorage.setItem(k, id); } catch (e) {}
    return id;
  } catch (e) { return null; }
}
async function playAt(i) {
  if (i < 0 || i >= queue.length) return;
  idx = i; const t = queue[i]; stop(); ui(t); prog(0, 0);
  addDoc(col("history"), {id: t.id, title: t.title, artist: t.artist, cover: t.cover, preview: t.preview, album: t.album || "", at: Date.now()}).catch(() => {});
  if (YT_KEY && ytReady) { const id = await ytSearch(t); if (id && idx === i) { mode = "yt"; yt.loadVideoById(id); return; } }
  mode = "audio";
  if (!t.preview) { next(); return; }
  audio.src = t.preview; audio.play().catch(() => {});
}
function setPlay(p) { $$(".pp").forEach(b => b.textContent = p ? "⏸" : "▶"); }
function prog(cur, dur) {
  const p = dur ? cur / dur * 1000 : 0;
  ["#pBar", "#fBar"].forEach(s => { const e = $(s); e.value = p; e.style.setProperty("--p", p / 10 + "%"); });
  $("#fCur").textContent = fmt(cur); $("#fDur").textContent = fmt(dur);
}
function ui(t) {
  $("#pTitle").textContent = $("#fTitle").textContent = t.title;
  $("#pArtist").textContent = $("#fArtist").textContent = t.artist;
  $("#pCover").src = $("#fCover").src = t.cover; $("#fBg").style.backgroundImage = `url("${t.cover}")`;
  $$(".fv").forEach(b => { b.textContent = favs.has(t.id) ? "♥" : "♡"; b.classList.toggle("on", favs.has(t.id)); });
  $$(".row").forEach((r, n) => r.classList.toggle("now", n === idx));
  document.title = t.title + " • " + t.artist;
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({title: t.title, artist: t.artist, album: t.album || "", artwork: [{src: t.cover, sizes: "500x500"}]});
}
const next = () => idx + 1 < queue.length ? playAt(idx + 1) : null;
const prev = () => playAt(Math.max(0, idx - 1));
const toggle = () => {
  if (idx < 0) return;
  if (mode === "yt") ytState === 1 ? yt.pauseVideo() : yt.playVideo();
  else audio.paused ? audio.play() : audio.pause();
};
audio.onended = next;
audio.onplay = audio.onpause = () => { if (mode === "audio") setPlay(!audio.paused); };
audio.ontimeupdate = () => { if (mode === "audio") prog(audio.currentTime, audio.duration); };
$$(".nx").forEach(b => b.onclick = e => { e.stopPropagation(); next(); });
$$(".pv").forEach(b => b.onclick = e => { e.stopPropagation(); prev(); });
$$(".pp").forEach(b => b.onclick = e => { e.stopPropagation(); toggle(); });
["#pBar", "#fBar"].forEach(s => $(s).oninput = e => {
  const p = e.target.value / 1000;
  if (mode === "yt" && yt.getDuration) yt.seekTo(p * yt.getDuration(), true);
  else if (audio.duration) audio.currentTime = p * audio.duration;
});
$$(".fv").forEach(b => b.onclick = async e => {
  e.stopPropagation();
  const t = queue[idx]; if (!t) return;
  const ref = doc(db, "slify", "me", "favorites", t.id);
  if (favs.has(t.id)) { favs.delete(t.id); await deleteDoc(ref); }
  else { favs.add(t.id); await setDoc(ref, {id: t.id, title: t.title, artist: t.artist, cover: t.cover, preview: t.preview, album: t.album || "", at: Date.now()}); }
  ui(t); if (tab === "favs") go("favs");
});

/* tela cheia + atalhos */
$("#openFull").onclick = () => { if (idx >= 0) $("#full").hidden = false; };
$("#fClose").onclick = () => $("#full").hidden = true;
document.addEventListener("keydown", e => {
  const tg = e.target.tagName;
  if (tg === "INPUT" && e.target.type !== "range" || tg === "TEXTAREA" || $("#dlg").open) return;
  if (e.code === "Space") { e.preventDefault(); if (tg === "BUTTON") e.target.blur(); toggle(); }
  else if (e.code === "Escape") $("#full").hidden = true;
  else if (e.code === "ArrowRight" && e.shiftKey) next();
  else if (e.code === "ArrowLeft" && e.shiftKey) prev();
});
if ("mediaSession" in navigator) {
  const m = navigator.mediaSession;
  m.setActionHandler("play", toggle); m.setActionHandler("pause", toggle);
  m.setActionHandler("nexttrack", next); m.setActionHandler("previoustrack", prev);
}

/* download (prévia de 30s em MP3; a música inteira vem só pelo YouTube e não é baixável aqui) */
$$(".dl").forEach(b => b.onclick = async e => {
  e.stopPropagation();
  const t = queue[idx]; if (!t || !t.preview) return toast("Escolha uma música primeiro");
  const name = `${t.artist} - ${t.title}.mp3`.replace(/[\\/:*?"<>|]/g, "");
  toast("Baixando…");
  try {
    const blob = await (await fetch(t.preview)).blob();
    const f = new File([blob], name, {type: "audio/mpeg"});
    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({files: [f]})) {
      await navigator.share({files: [f]}); return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    toast("Download iniciado");
  } catch (err) {
    if (err.name === "AbortError") return;
    window.open(t.preview, "_blank"); toast("Abra o áudio e escolha Baixar / Salvar");
  }
});

/* ----- YouTube (opcional) ----- */
function initYT() {
  if (!YT_KEY) return;
  window.onYouTubeIframeAPIReady = () => {
    yt = new YT.Player("yt", {height: "200", width: "200", events: {
      onReady: () => ytReady = true,
      onStateChange: e => { ytState = e.data; if (mode === "yt") setPlay(e.data === 1); if (e.data === 0) next(); }
    }});
  };
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  setInterval(() => { if (mode === "yt" && ytReady && yt.getDuration?.() > 0) prog(yt.getCurrentTime(), yt.getDuration()); }, 500);
}

/* ----- chave da API ----- */
const dlg = $("#dlg"), KREF = () => doc(db, "slify", "me", "config", "api");
const setK = async v => {
  try { v ? localStorage.setItem("slify_yt_key", v) : localStorage.removeItem("slify_yt_key"); } catch (e) {}
  try { v ? await setDoc(KREF(), {ytKey: v}) : await deleteDoc(KREF()); } catch (e) {}
  location.reload();
};
$("#btnKey").onclick = () => { $("#keyIn").value = YT_KEY; dlg.showModal(); };
$("#keySave").onclick = () => setK($("#keyIn").value.trim());
$("#keyDel").onclick = () => setK("");
$("#keyClose").onclick = () => { try { localStorage.setItem("slify_skip", "1"); } catch (e) {} dlg.close(); };

/* ----- tema claro / escuro ----- */
const applyTheme = d => {
  d ? document.documentElement.dataset.theme = "dark" : delete document.documentElement.dataset.theme;
  $("#btnTheme span").textContent = d ? "Modo claro" : "Modo escuro";
  $('meta[name="theme-color"]').content = d ? "#121212" : "#cfe6fa";
};
applyTheme(document.documentElement.dataset.theme === "dark");
$("#btnTheme").onclick = () => {
  const d = document.documentElement.dataset.theme !== "dark"; applyTheme(d);
  try { localStorage.setItem("slify_theme", d ? "dark" : "light"); } catch (e) {}
};

/* ----- início ----- */
(async () => {
  $("#view").innerHTML = '<p class="empty">Buscando lançamentos…</p>';
  if (!YT_KEY) {
    try {
      const d = await getDoc(KREF());
      if (d.exists() && d.data().ytKey) { YT_KEY = d.data().ytKey; try { localStorage.setItem("slify_yt_key", YT_KEY); } catch (e) {} }
    } catch (e) {}
  }
  initYT();
  try { (await getDocs(col("favorites"))).forEach(d => favs.add(d.id)); } catch (e) {}
  await syncReleases();
  go("new");
  let skip = false; try { skip = !!localStorage.getItem("slify_skip"); } catch (e) {}
  if (!YT_KEY && !skip) dlg.showModal();
})();
