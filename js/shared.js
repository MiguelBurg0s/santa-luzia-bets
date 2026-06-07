// -- CONFIG -----------------------------------------
const SUPABASE_URL     = 'https://SEU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY= 'SUA_ANON_KEY_AQUI';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: true,
    flowType: 'pkce',          // mais seguro e compatível com redirect
    persistSession: true,
    autoRefreshToken: true,
  }
});

// -- FASES ------------------------------------------
const FASES = [
  { id:'grupos',  label:'Fase de Grupos',   pts:1, max:32 },
  { id:'32avos',  label:'32avos de Final',  pts:1, max:16 },
  { id:'16avos',  label:'16avos de Final',  pts:2, max:8  },
  { id:'8avos',   label:'8avos de Final',   pts:2, max:4  },
  { id:'quartos', label:'Quartos de Final', pts:2, max:2  },
  { id:'meias',   label:'Meias-finais',     pts:3, max:1  },
  { id:'campeao', label:'Campeão',          pts:3, max:1  },
];

// -- KICKOFFS (hora de Portugal) --------------------
const GROUP_KICKOFFS = {
  A: new Date('2026-06-11T19:00:00Z'),
  B: new Date('2026-06-12T19:00:00Z'),
  C: new Date('2026-06-13T19:00:00Z'),
  D: new Date('2026-06-12T21:00:00Z'),
  E: new Date('2026-06-14T13:00:00Z'),
  F: new Date('2026-06-14T16:00:00Z'),
  G: new Date('2026-06-15T15:00:00Z'),
  H: new Date('2026-06-15T12:00:00Z'),
  I: new Date('2026-06-16T15:00:00Z'),
  J: new Date('2026-06-16T21:00:00Z'),
  K: new Date('2026-06-17T13:00:00Z'),
  L: new Date('2026-06-17T16:00:00Z'),
};

function isGroupLocked(id)  { const k = GROUP_KICKOFFS[id]; return k ? new Date() >= k : false; }
function kickoffLabel(id) {
  const k = GROUP_KICKOFFS[id]; if (!k) return '';
  return k.toLocaleString('pt-PT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Lisbon' }).replace(',',' ·');
}
function timeUntilLock(id) {
  const k = GROUP_KICKOFFS[id]; if (!k) return '';
  const d = k - new Date(); if (d <= 0) return 'Encerrado';
  const days=Math.floor(d/86400000), hours=Math.floor((d%86400000)/3600000), mins=Math.floor((d%3600000)/60000);
  if (days > 0)  return `Fecha em ${days}d ${hours}h`;
  if (hours > 0) return `Fecha em ${hours}h ${mins}m`;
  return `Fecha em ${mins}m`;
}

// -- AVATAR / FLAGS ---------------------------------
const AVATAR_COLORS = ['#2d9e58','#c9a020','#e85555','#4a90d9','#9b59b6','#e67e22','#1abc9c','#e84393'];

function flagImg(code, size=24) {
  const h = Math.round(size * 0.75);
  return `<img src="https://flagcdn.com/${size}x${h}/${code.toLowerCase()}.png" width="${size}" height="${h}" style="border-radius:2px;object-fit:cover;vertical-align:middle;flex-shrink:0" onerror="this.style.display='none'" alt="${code}">`;
}

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return (p.length === 1 ? p[0].slice(0,2) : p[0][0] + p[p.length-1][0]).toUpperCase();
}

function avatarEl(name, color, size=34, fontSize=13) {
  return `<div class="rank-avatar" style="width:${size}px;height:${size}px;font-size:${fontSize}px;background:${color}">${getInitials(name)}</div>`;
}

// -- TOAST ------------------------------------------
let _toastTimer;
function showToast(msg, isErr=false) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// -- MODAL ------------------------------------------
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// -- AUTH GUARD -------------------------------------
// Chama nas páginas que requerem auth; redireciona para / se não autenticado
async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = '/'; return null; }
  return session.user;
}

// -- PROFILE ----------------------------------------
async function getOrCreateProfile(user) {
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (data) return data;
  const name  = user.user_metadata?.full_name || user.email.split('@')[0];
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const { data: c } = await sb.from('profiles').insert({ id: user.id, display_name: name, avatar_color: color }).select().single();
  return c;
}

// -- USER MENU --------------------------------------
function setupUserMenu(profile, user) {
  const av   = document.getElementById('header-avatar');
  const name = document.getElementById('header-name');
  if (av)   { av.textContent = getInitials(profile.display_name); av.style.background = profile.avatar_color; }
  if (name) name.textContent = profile.display_name.split(' ')[0];

  document.addEventListener('click', e => {
    if (!e.target.closest('#user-badge')) document.getElementById('user-menu')?.classList.remove('open');
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
  });
}

function toggleUserMenu() { document.getElementById('user-menu')?.classList.toggle('open'); }

async function logout() {
  await sb.auth.signOut();
  window.location.href = '/';
}

// -- PERFIL MODAL -----------------------------------
function openPerfil(profile) {
  document.getElementById('user-menu')?.classList.remove('open');
  document.getElementById('perfil-name').textContent  = profile.display_name;
  document.getElementById('perfil-email').textContent = profile.email || '';
  document.getElementById('perfil-name-input').value  = profile.display_name;
  const av = document.getElementById('perfil-avatar');
  av.textContent = getInitials(profile.display_name); av.style.background = profile.avatar_color;
  document.getElementById('color-picker').innerHTML = AVATAR_COLORS.map(c =>
    `<div class="color-swatch ${c===profile.avatar_color?'active':''}" style="background:${c}" onclick="selectColor('${c}')"></div>`
  ).join('');
  openModal('modal-perfil');
}

function selectColor(c) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.style.background===c||s.style.backgroundColor===c));
  document.getElementById('perfil-avatar').style.background = c;
  window._pendingColor = c;
}

async function savePerfil(profile, onSaved) {
  const name  = document.getElementById('perfil-name-input').value.trim();
  const color = window._pendingColor || profile.avatar_color;
  if (!name) { showToast('Introduz um nome', true); return; }
  const { error } = await sb.from('profiles').update({ display_name: name, avatar_color: color }).eq('id', profile.id);
  if (error) { showToast('Erro ao guardar', true); return; }
  profile.display_name = name; profile.avatar_color = color;
  setupUserMenu(profile, null);
  closeModal('modal-perfil');
  showToast('✅ Perfil atualizado!');
  if (onSaved) onSaved(profile);
}
