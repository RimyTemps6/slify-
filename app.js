import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,setDoc,deleteDoc,addDoc,getDocs,query,orderBy,limit,writeBatch} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ===== CONFIGURAÇÃO ===== */
const firebaseConfig = {
  apiKey: "AIzaSyC7oveo-af8gkSO3zbaKIlX0JIvFP47Yr0",
  authDomain: "slify-ef128.firebaseapp.com",
  projectId: "slify-ef128",
  storageBucket: "slify-ef128.firebasestorage.app",
  messagingSenderId: "206220562373",
  appId: "1:206220562373:web:48ae302e1fee142a3685ac"
};
// OPCIONAL: chave da YouTube Data API v3. Vazia = toca prévias de 30s. Preenchida = toca a música inteira.
const YT_KEY = "";
/* ======================== */

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let user, tab = "new", queue = [], idx = -1, favs = new Set(), mode = "audio", yt, ytReady = false, ytState = -1;
const audio = new Audio();
const col = n => collection(db, "users", user.uid, n);

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

/* ----- login ----- */
$("#btnLogin").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => alert("Não foi possível entrar: " + e.code));
$("#btnOut").onclick = () => { stop(); signOut(auth); };
onAuthStateChanged(auth, async u => {
  user = u;
  $("#login").hidden = !!u; $("#app").hidden = !u;
  if (!u) return;
  $("#view").innerHTML = '<p class="empty">Buscando lançamentos…</p>';
  try { (await getDocs(col("favorites"))).forEach(d => favs.add(d.id)); } catch (e) {}
  await syncReleases();
  go("new");
});

/* ----- lançamentos: busca e salva no Firestore automaticamente ----- */
async function syncReleases() {
  let list = [];
  for (const u of ["editorial/0/releases?limit=50", "chart/0/albums?limit=50"]) {
    try { const r = await jsonp("https://api.deezer.com/" + u); list = r.data || []; } catch (e) {}
    if (list.length) break;
  }
  if (!list.length) return;
  const today = new Date().toISOString().slice(0, 10), b = writeBatch(db);
  list.forEach(a => b.set(doc(db, "users", user.uid, "albums", String(a.id)), {
    id: String(a.id), title: a.title || "", artist: a.artist?.name || "",
    cover: a.cover_big || a.cover_medium || "", date: a.release_date || today
  }, {merge: true}));
  try { await b.commit(); } catch (e) { console.error(e); }
}

/* ----- telas ----- */
document.querySelectorAll("nav button").forEach(b => b.onclick = () => go(b.dataset.tab));
async function go(t) {
  tab = t;
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  const v = $("#view"); v.innerHTML = '<p class="empty">Carregando…</p>';
  try {
    if (t === "new") {
      const s = await getDocs(query(col("albums"), orderBy("date", "desc"), limit(60)));
      const arr = s.docs.map(d => d.data());
      v.innerHTML = arr.length ? '<div class="grid">' + arr.map((a, i) =>
        `<button class="album" data-i="${i}"><img src="${esc(a.cover)}" alt="" loading="lazy"><b>${esc(a.title)}</b><span>${esc(a.artist)}</span></button>`).join("") + "</div>"
        : '<p class="empty">Nenhum lançamento encontrado. Verifique a conexão e recarregue.</p>';
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
function showTracks(arr, emptyMsg, back) {
  const v = $("#view");
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
  idx = i; const t = queue[i]; stop(); ui(t);
  addDoc(col("history"), {id: t.id, title: t.title, artist: t.artist, cover: t.cover, preview: t.preview, album: t.album || "", at: Date.now()}).catch(() => {});
  if (YT_KEY && ytReady) { const id = await ytSearch(t); if (id && idx === i) { mode = "yt"; yt.loadVideoById(id); return; } }
  mode = "audio";
  if (!t.preview) { next(); return; }
  audio.src = t.preview; audio.play().catch(() => {});
}
function ui(t) {
  $("#pTitle").textContent = t.title; $("#pArtist").textContent = t.artist; $("#pCover").src = t.cover;
  $("#pFav").textContent = favs.has(t.id) ? "♥" : "♡";
  document.querySelectorAll(".row").forEach((r, n) => r.classList.toggle("now", n === idx));
}
const next = () => idx + 1 < queue.length ? playAt(idx + 1) : null;
const prev = () => playAt(Math.max(0, idx - 1));
audio.onended = next;
audio.onplay = audio.onpause = () => { if (mode === "audio") $("#pPlay").textContent = audio.paused ? "▶" : "⏸"; };
audio.ontimeupdate = () => { if (mode === "audio" && audio.duration) $("#pBar").value = audio.currentTime / audio.duration * 1000; };
$("#pNext").onclick = next; $("#pPrev").onclick = prev;
$("#pPlay").onclick = () => {
  if (idx < 0) return;
  if (mode === "yt") ytState === 1 ? yt.pauseVideo() : yt.playVideo();
  else audio.paused ? audio.play() : audio.pause();
};
$("#pBar").oninput = e => {
  const p = e.target.value / 1000;
  if (mode === "yt" && yt.getDuration) yt.seekTo(p * yt.getDuration(), true);
  else if (audio.duration) audio.currentTime = p * audio.duration;
};
$("#pFav").onclick = async () => {
  const t = queue[idx]; if (!t) return;
  const ref = doc(db, "users", user.uid, "favorites", t.id);
  if (favs.has(t.id)) { favs.delete(t.id); await deleteDoc(ref); }
  else { favs.add(t.id); await setDoc(ref, {id: t.id, title: t.title, artist: t.artist, cover: t.cover, preview: t.preview, album: t.album || "", at: Date.now()}); }
  ui(t); if (tab === "favs") go("favs");
};

/* ----- YouTube (opcional) ----- */
if (YT_KEY) {
  window.onYouTubeIframeAPIReady = () => {
    yt = new YT.Player("yt", {height: "200", width: "200", events: {
      onReady: () => ytReady = true,
      onStateChange: e => { ytState = e.data; if (mode === "yt") $("#pPlay").textContent = e.data === 1 ? "⏸" : "▶"; if (e.data === 0) next(); }
    }});
  };
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  setInterval(() => { if (mode === "yt" && ytReady && yt.getDuration?.() > 0) $("#pBar").value = yt.getCurrentTime() / yt.getDuration() * 1000; }, 500);
}
