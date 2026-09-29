'use strict';
/* ============ AYARLAR (README'deki adımlara göre doldurun) ============ */
const SUPABASE_URL = 'https://rhchcpdlamgdyuxcixca.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_L481l83-Ws2EyoVUlMyurg_bty7K3iz';

/* Aralıklı tekrar ayarları: sayıları buradan değiştirebilirsiniz */
const REVIEW_CONFIG = {
  hardFrom: 8,                 // zorluk >= 8  -> zor
  midFrom: 5,                  // zorluk 5-7   -> orta
  firstReview: { hard: 1, mid: 3, easy: 7 }, // ilk çalışmadan sonra (gün)
  ladder: [7, 14, 30],         // sonraki çalışmalar: 2., 3., 4. ve sonrası
  midMaxDays: 7,               // orta zorlukta aralık en fazla bu kadar olsun
  hardStreak: 3                // art arda kaç zor çalışma "zor kavram" sayılır
};
const PAGE_SIZE = 10;

/* ============ Genel durum ve yardımcılar ============ */
let db = null;
let busy = false;
const state = { user: null, courses: [], topics: [], sessions: [], courseId: null, shown: PAGE_SIZE, editCourseId: null, editTopicId: null };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#7c3aed');

function toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const todayISO = () => toISO(new Date());
function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); return toISO(new Date(y, m - 1, d + n)); }
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} saat ${m} dakika`;
  return h ? `${h} saat` : `${m} dakika`;
}
const avg = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—');

function showError(e) {
  const raw = typeof e === 'string' ? e : (e && e.message) || '';
  const msg = typeof e === 'string' ? e
    : /fetch|network|load failed/i.test(raw) ? 'Veritabanına bağlanılamadı. İnternet bağlantınızı kontrol edin.'
    : raw || 'Bir hata oluştu.';
  const bar = $('errorBar');
  bar.textContent = msg; bar.hidden = false;
  clearTimeout(showError.t);
  showError.t = setTimeout(() => (bar.hidden = true), 7000);
}

/* Çift tıklamayı engeller: kayıt sürerken buton kilitli kalır */
async function guarded(btn, fn) {
  if (busy) return;
  busy = true; if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { showError(e); } finally { busy = false; if (btn) btn.disabled = false; }
}
function must(res) { if (res.error) throw res.error; return res.data; }

/* ============ Veritabanı işlemleri ============ */
async function loadCourses() { state.courses = must(await db.from('courses').select('*').order('created_at')); }
async function loadTopics() { state.topics = must(await db.from('topics').select('*').order('created_at')); }
async function loadStudySessions() {
  state.sessions = must(await db.from('study_sessions').select('*')
    .order('studied_at', { ascending: false }).order('created_at', { ascending: false }));
}
async function loadAll() { await Promise.all([loadCourses(), loadTopics(), loadStudySessions()]); }

async function saveCourse({ id, name, color }) {
  if (id) must(await db.from('courses').update({ name, color }).eq('id', id));
  else must(await db.from('courses').insert({ name, color, user_id: state.user.id }));
  await loadCourses();
}
async function deleteCourse(id) { must(await db.from('courses').delete().eq('id', id)); await loadAll(); }
async function saveTopic({ id, courseId, name }) {
  if (id) must(await db.from('topics').update({ name }).eq('id', id));
  else must(await db.from('topics').insert({ name, course_id: courseId, user_id: state.user.id }));
  await loadTopics();
}
async function deleteTopic(id) { must(await db.from('topics').delete().eq('id', id)); await Promise.all([loadTopics(), loadStudySessions()]); }
async function saveStudySession(row) {
  must(await db.from('study_sessions').insert({ ...row, user_id: state.user.id }));
  await loadStudySessions();
}

/* ============ Aralıklı tekrar ============ */
const sessionsOfTopic = (topicId) => state.sessions.filter((s) => s.topic_id === topicId); // yeniden eskiye

/* Sonraki tekrar tarihini hesaplar.
   prevCount: bu konuda daha önce kaç çalışma yapıldı. */
function calculateNextReview(studiedAt, difficulty, prevCount) {
  const c = REVIEW_CONFIG;
  let days;
  if (difficulty >= c.hardFrom) days = c.firstReview.hard;               // çok zor: hep 1 gün
  else if (prevCount === 0) days = difficulty >= c.midFrom ? c.firstReview.mid : c.firstReview.easy;
  else {
    days = c.ladder[Math.min(prevCount - 1, c.ladder.length - 1)];
    if (difficulty >= c.midFrom) days = Math.min(days, c.midMaxDays);
  }
  return addDays(studiedAt, days);
}

/* Zor kavram: konunun son N çalışması hep yüksek zorlukta mı? */
function isHardTopic(topicId) {
  const last = sessionsOfTopic(topicId).slice(0, REVIEW_CONFIG.hardStreak);
  return last.length >= REVIEW_CONFIG.hardStreak && last.every((s) => s.difficulty >= REVIEW_CONFIG.hardFrom);
}

/* Her konunun en son çalışması, tekrar takvimini belirler */
function latestPerTopic(list) {
  const seen = new Set(), out = [];
  for (const s of list) { if (s.topic_id && !seen.has(s.topic_id)) { seen.add(s.topic_id); out.push(s); } }
  return out;
}
function loadTodayReviews() {
  const t = todayISO(), latest = latestPerTopic(state.sessions);
  return {
    due: latest.filter((s) => s.next_review_at <= t),
    upcoming: latest.filter((s) => s.next_review_at > t && s.next_review_at <= addDays(t, 3))
  };
}

/* ============ Görünüm çizimi ============ */
const courseById = (id) => state.courses.find((c) => c.id === id);
const topicById = (id) => state.topics.find((t) => t.id === id);

function render() {
  const app = !!state.user;
  $('authView').hidden = app; $('appView').hidden = !app;
  if (!app) return;
  const course = state.courseId && courseById(state.courseId);
  if (!course) state.courseId = null;
  $('homeView').hidden = !!course; $('courseView').hidden = !course;
  if (course) renderCourse(course); else renderHome();
}

function reviewLine(s) {
  const c = courseById(s.course_id), t = topicById(s.topic_id);
  const late = s.next_review_at < todayISO();
  return `<li style="--c:${safeColor(c?.color)}"><span><span class="dot"></span><b>${esc(c?.name)}</b> — ${esc(t?.name)}</span>
    <button class="btn small" data-action="open-course" data-id="${s.course_id}">${late ? 'Gecikti' : fmtDate(s.next_review_at)}</button></li>`;
}

function renderHome() {
  const t = todayISO();
  const minutes = state.sessions.filter((s) => s.studied_at === t).reduce((a, s) => a + s.duration_minutes, 0);
  const { due, upcoming } = loadTodayReviews();
  $('todayBox').innerHTML = `
    <p><b>Bugünkü çalışma:</b> ${minutes ? fmtDur(minutes) : 'Henüz kayıt yok'}<br>
    <b>Bugün tekrar edilecek konu:</b> ${due.length}</p>
    ${due.length ? `<ul class="list">${due.map(reviewLine).join('')}</ul>` : '<p class="empty">Bugün tekrar zamanı gelen konu yok.</p>'}
    ${upcoming.length ? `<h3>Yaklaşan tekrarlar</h3><ul class="list">${upcoming.map(reviewLine).join('')}</ul>` : ''}`;
  $('courseGrid').innerHTML = state.courses.length ? state.courses.map((c) => {
    const n = state.topics.filter((x) => x.course_id === c.id).length;
    return `<article class="card" style="--c:${safeColor(c.color)}" data-action="open-course" data-id="${c.id}" tabindex="0" role="link">
      <div class="strip"></div><div class="body"><h3>${esc(c.name)}</h3><p class="muted">${n} konu</p></div></article>`;
  }).join('') : '<p class="empty">Henüz ders yok. "+ Ders Ekle" ile başla.</p>';
}

function renderCourse(c) {
  const topics = state.topics.filter((x) => x.course_id === c.id);
  const all = state.sessions.filter((s) => s.course_id === c.id);
  const latest = latestPerTopic(all);
  const next = latest.map((s) => s.next_review_at).sort()[0];
  const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const shown = all.slice(0, state.shown);
  $('courseView').innerHTML = `
    <button class="btn ghost" data-action="back">← Geri dön</button>
    <div class="course-head" style="--c:${safeColor(c.color)}; margin-top:12px">
      <div class="top"><h1>${esc(c.name)}</h1>
        <div class="row">
          <button class="btn primary" data-action="start-study">Çalışmaya Başla</button>
          <button class="btn" data-action="edit-course">Düzenle</button>
          <button class="btn danger" data-action="delete-course">Sil</button>
        </div></div></div>
    <div class="stats">
      ${stat(all.length ? fmtDur(all.reduce((a, s) => a + s.duration_minutes, 0)) : '0 dakika', 'Toplam çalışma süresi')}
      ${stat(topics.length, 'Konu sayısı')}${stat(all.length, 'Çalışma oturumu')}
      ${stat(avg(all.map((s) => s.productivity)), 'Ortalama verimlilik')}
      ${stat(avg(all.map((s) => s.difficulty)), 'Ortalama zorluk')}
      ${stat(all.length ? fmtDate(all[0].studied_at) : '—', 'Son çalışma')}
      ${stat(next ? fmtDate(next) : '—', 'Sonraki tekrar')}
    </div>
    <div class="top"><h2>Konular</h2><button class="btn small primary" data-action="add-topic">+ Konu Ekle</button></div>
    <div class="panel">${topics.length ? `<ul class="list">${topics.map((t) => `
      <li><span>${esc(t.name)}${isHardTopic(t.id) ? '<span class="badge">Zor kavram</span>' : ''}
        <br><span class="muted">${sessionsOfTopic(t.id).length} çalışma</span></span>
        <span class="row"><button class="btn small" data-action="start-study" data-topic="${t.id}">Çalış</button>
        <button class="btn small" data-action="edit-topic" data-id="${t.id}">Düzenle</button>
        <button class="btn small danger" data-action="delete-topic" data-id="${t.id}">Sil</button></span></li>`).join('')}</ul>`
      : '<p class="empty">Bu derse henüz konu eklenmedi.</p>'}</div>
    <h2>Çalışma geçmişi</h2>
    ${shown.length ? shown.map((s) => `
      <div class="entry"><b>${fmtDate(s.studied_at)}</b> — ${esc(topicById(s.topic_id)?.name || 'Silinmiş konu')}
        <p class="muted">${fmtDur(s.duration_minutes)} · Verimlilik: ${s.productivity}/10 · Zorluk: ${s.difficulty}/10</p>
        ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
        <p class="muted">Sonraki tekrar: ${fmtDate(s.next_review_at)}</p></div>`).join('') : '<p class="empty">Henüz çalışma kaydı yok.</p>'}
    ${all.length > state.shown ? '<button class="btn" data-action="more">Daha fazla göster</button>' : ''}`;
}

/* ============ Pencereler ============ */
function openCourseDialog(course) {
  state.editCourseId = course ? course.id : null;
  $('courseDialogTitle').textContent = course ? 'Dersi düzenle' : 'Ders ekle';
  $('courseName').value = course ? course.name : '';
  $('courseColor').value = course ? safeColor(course.color) : '#7c3aed';
  $('courseDialog').showModal();
}
function openTopicDialog(topic) {
  state.editTopicId = topic ? topic.id : null;
  $('topicDialogTitle').textContent = topic ? 'Konuyu düzenle' : 'Konu ekle';
  $('topicName').value = topic ? topic.name : '';
  $('topicDialog').showModal();
}
function openSessionDialog(topicId) {
  const topics = state.topics.filter((t) => t.course_id === state.courseId);
  if (!topics.length) return showError('Önce bu derse en az bir konu ekle.');
  $('sessionForm').reset();
  $('sessionCourseName').textContent = 'Ders: ' + courseById(state.courseId).name;
  $('sessionTopic').innerHTML = topics.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  if (topicId) $('sessionTopic').value = topicId;
  $('sessionDate').value = todayISO();
  $('prodOut').textContent = '5'; $('diffOut').textContent = '5';
  updatePrevNote();
  $('sessionDialog').showModal();
}
/* Seçili konunun son notunu göster; yoksa dersin son notunu göster */
function updatePrevNote() {
  const topicId = $('sessionTopic').value;
  let prev = sessionsOfTopic(topicId).find((s) => s.note), label = 'Bu konudaki önceki çalışma notun';
  if (!prev) { prev = state.sessions.find((s) => s.course_id === state.courseId && s.note); label = 'Bu dersteki son çalışma notun'; }
  const box = $('prevNote');
  box.hidden = !prev;
  if (prev) box.innerHTML = `<b>${label} (${fmtDate(prev.studied_at)}):</b><br>${esc(prev.note)}`;
  $('hardWarn').hidden = !isHardTopic(topicId);
}

/* ============ Olaylar ============ */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id;
  const course = courseById(state.courseId);
  if (a === 'add-course') openCourseDialog(null);
  else if (a === 'close-dialog') el.closest('dialog').close();
  else if (a === 'open-course') { state.courseId = id; state.shown = PAGE_SIZE; render(); window.scrollTo(0, 0); }
  else if (a === 'back') { state.courseId = null; render(); }
  else if (a === 'edit-course') openCourseDialog(course);
  else if (a === 'delete-course') {
    if (confirm(`"${course.name}" dersi, konuları ve tüm çalışma kayıtları silinecek. Emin misin?`))
      guarded(el, async () => { await deleteCourse(course.id); state.courseId = null; render(); });
  }
  else if (a === 'add-topic') openTopicDialog(null);
  else if (a === 'edit-topic') openTopicDialog(topicById(id));
  else if (a === 'delete-topic') {
    if (confirm('Bu konu silinecek. Emin misin?')) guarded(el, async () => { await deleteTopic(id); render(); });
  }
  else if (a === 'start-study') openSessionDialog(el.dataset.topic);
  else if (a === 'more') { state.shown += PAGE_SIZE; render(); }
  else if (a === 'logout') { await db.auth.signOut(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.card[data-action]')) e.target.click();
});

$('courseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('courseName').value.trim();
  if (!name) return showError('Ders adı boş olamaz.');
  guarded(e.submitter, async () => {
    await saveCourse({ id: state.editCourseId, name, color: $('courseColor').value });
    $('courseDialog').close(); render();
  });
});
$('topicForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('topicName').value.trim();
  if (!name) return showError('Konu adı boş olamaz.');
  guarded(e.submitter, async () => {
    await saveTopic({ id: state.editTopicId, courseId: state.courseId, name });
    $('topicDialog').close(); render();
  });
});
$('sessionTopic').addEventListener('change', updatePrevNote);
$('sessionProd').addEventListener('input', (e) => ($('prodOut').textContent = e.target.value));
$('sessionDiff').addEventListener('input', (e) => ($('diffOut').textContent = e.target.value));
$('sessionForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const duration = Number($('sessionDuration').value);
  const prod = Number($('sessionProd').value), diff = Number($('sessionDiff').value);
  const topicId = $('sessionTopic').value, date = $('sessionDate').value;
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) return showError('Çalışma süresi 1 ile 1440 dakika arasında bir tam sayı olmalı.');
  if (![prod, diff].every((n) => Number.isInteger(n) && n >= 1 && n <= 10)) return showError('Puanlar 1 ile 10 arasında olmalı.');
  if (!topicId || !date) return showError('Konu ve tarih seçmelisin.');
  guarded(e.submitter, async () => {
    await saveStudySession({
      course_id: state.courseId, topic_id: topicId, duration_minutes: duration,
      productivity: prod, difficulty: diff, note: $('sessionNote').value.trim(),
      studied_at: date, next_review_at: calculateNextReview(date, diff, sessionsOfTopic(topicId).length)
    });
    $('sessionDialog').close(); render();
  });
});

$('authForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('authEmail').value.trim(), password = $('authPassword').value;
  const signup = e.submitter && e.submitter.value === 'signup';
  guarded(e.submitter, async () => {
    if (signup) {
      const r = must(await db.auth.signUp({ email, password }));
      if (!r.session) showError('Kayıt oluşturuldu. E-postana gelen bağlantıyla hesabını onayla, sonra giriş yap.');
    } else must(await db.auth.signInWithPassword({ email, password }));
  });
});

/* ============ Başlangıç ============ */
async function onUser(user) {
  state.user = user;
  if (user) { try { await loadAll(); } catch (e) { showError(e); } } else { state.courses = state.topics = state.sessions = []; state.courseId = null; }
  render();
}
async function init() {
  if (SUPABASE_URL.startsWith('BURAYA') || SUPABASE_ANON_KEY.startsWith('BURAYA')) {
    $('authView').hidden = false;
    return showError('script.js içine Supabase URL ve anon key bilgilerini yazmalısın (README.txt).');
  }
  try {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await db.auth.getSession();
    await onUser(data.session ? data.session.user : null);
    db.auth.onAuthStateChange((_ev, session) => {
      const u = session ? session.user : null;
      if ((u && u.id) !== (state.user && state.user.id)) onUser(u); // token yenilemede tekrar yükleme yapma
    });
  } catch (e) { $('authView').hidden = false; showError(e); }
}
init();
