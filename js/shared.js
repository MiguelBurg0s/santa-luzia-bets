// -- CONFIG -----------------------------------------
const SUPABASE_URL     = 'https://viktzbxvylzitbkeahzj.supabase.co';
const SUPABASE_ANON_KEY= 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa3R6Ynh2eWx6aXRia2VhaHpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODI2MDcsImV4cCI6MjA5NjM1ODYwN30.8CrpmEojLiTFn7-WXvNQzdW_nQFYgvUZLWUrZGUvKjE';
const FD_API_KEY        = 'dff7d036b5ff4867afcb3e01a7dc6ddd';
const FD_BASE           = 'https://api.football-data.org/v4';
const WC_SEASON         = 2026;

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: true,
    flowType: 'pkce',
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
  { id:'campeao', label:'Campeao',          pts:3, max:1  },
];

// Mapear stage da API -> fase id
const STAGE_MAP = {
  'GROUP_STAGE'    : 'grupos',
  'LAST_32'        : '32avos',
  'LAST_16'        : '16avos',
  'QUARTER_FINALS' : 'quartos',
  'SEMI_FINALS'    : 'meias',
  'FINAL'          : 'campeao',
};

// -- FOOTBALL-DATA.ORG API (via Supabase Edge Function proxy) --
// A API nao permite chamadas directas do browser (CORS).
// Usamos uma Edge Function do Supabase como proxy.
async function fdFetch(path) {
  const proxyUrl = `${SUPABASE_URL}/functions/v1/football-api?path=${encodeURIComponent(path)}`;
  const r = await fetch(proxyUrl, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  if (!r.ok) throw new Error(`football-data proxy error: ${r.status}`);
  return r.json();
}

// Busca grupos e equipas do Mundial 2026
// Usa /teams que e mais fiavel que /standings para obter os grupos
async function fetchWCGroups() {
  const data = await fdFetch(`/competitions/WC/teams?season=${WC_SEASON}`);
  const groupMap = {};

  for (const team of (data.teams || [])) {
    // A API devolve group como "Group A", "Group B", etc.
    const raw = team.group || '';
    // Suporta "Group A", "GROUP_A", "A"
    const letter = raw.replace(/^Group\s+/i, '').replace(/^GROUP_/, '').trim();
    if (!letter || letter.length !== 1) continue;

    if (!groupMap[letter]) groupMap[letter] = [];
    groupMap[letter].push({
      id:        team.id,
      name:      team.name,
      shortName: team.shortName || team.tla,
      flag_code: tlaToFlagCode(team.tla, team.name),
      crest:     team.crest,
    });
  }

  const groups = Object.entries(groupMap)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([letter, teams]) => ({
      id: letter,
      label: `Grupo ${letter}`,
      teams,
    }));

  // Fallback: se a API nao devolver grupos, usar standings
  if (groups.length === 0) {
    return fetchWCGroupsFromStandings();
  }

  return groups;
}

// Fallback via standings
async function fetchWCGroupsFromStandings() {
  const data = await fdFetch(`/competitions/WC/standings?season=${WC_SEASON}`);
  const groupMap = {};

  for (const standing of (data.standings || [])) {
    // standings tem type HOME, AWAY, TOTAL - queremos TOTAL
    // mas se nao houver TOTAL, aceitar qualquer um uma vez por grupo
    const raw   = standing.group || '';
    const letter = raw.replace(/^Group\s+/i, '').replace(/^GROUP_/, '').trim();
    if (!letter || letter.length !== 1) continue;
    if (groupMap[letter]) continue; // ja temos este grupo

    const teams = (standing.table || []).map(row => ({
      id:        row.team.id,
      name:      row.team.name,
      shortName: row.team.shortName || row.team.tla,
      flag_code: tlaToFlagCode(row.team.tla, row.team.name),
      crest:     row.team.crest,
    }));
    if (teams.length > 0) groupMap[letter] = teams;
  }

  return Object.entries(groupMap)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([letter, teams]) => ({ id: letter, label: `Grupo ${letter}`, teams }));
}

// Busca todos os jogos do WC e calcula quem passou cada fase
// Retorna: { [faseId]: Set<teamId> }
async function fetchWCResults() {
  const data = await fdFetch(`/competitions/WC/matches?season=${WC_SEASON}`);
  const results = {};
  FASES.forEach(f => results[f.id] = new Set());

  for (const match of (data.matches || [])) {
    // So contar jogos terminados
    if (match.status !== 'FINISHED') continue;

    const stage   = STAGE_MAP[match.stage];
    const nextFase = nextFaseId(stage);
    if (!stage || !nextFase) continue;

    const homeGoals = match.score?.fullTime?.home ?? 0;
    const awayGoals = match.score?.fullTime?.away ?? 0;
    const homeId    = match.homeTeam?.id;
    const awayId    = match.awayTeam?.id;

    if (stage === 'grupos') {
      // Na fase de grupos nao ha "vencedor" por jogo - usamos standings
      continue;
    }

    // Fases eliminatorias: quem ganhou avanca
    let winnerId = null;
    if (homeGoals > awayGoals) winnerId = homeId;
    else if (awayGoals > homeGoals) winnerId = awayId;
    else {
      // Empate - ver penaltis
      const homePen = match.score?.penalties?.home ?? 0;
      const awayPen = match.score?.penalties?.away ?? 0;
      winnerId = homePen >= awayPen ? homeId : awayId;
    }
    if (winnerId) results[nextFase].add(winnerId);
  }

  // Fase de grupos: usar standings para saber quem passou
  const standingsData = await fdFetch(`/competitions/WC/standings?season=${WC_SEASON}`);
  const allThirds = [];

  for (const standing of (standingsData.standings || [])) {
    if (standing.type !== 'TOTAL') continue;
    const table = standing.table;
    // 1o e 2o de cada grupo passam diretamente
    if (table[0]?.playedGames >= 3) results['grupos'].add(table[0].team.id);
    if (table[1]?.playedGames >= 3) results['grupos'].add(table[1].team.id);
    // 3os ficam em lista de espera
    if (table[2]?.playedGames >= 3) allThirds.push({ team: table[2].team, pts: table[2].points, gd: table[2].goalDifference, gf: table[2].goalsFor });
  }

  // Melhores 8 terceiros classificados passam (top 8 por pts, depois GD, depois GF)
  allThirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  allThirds.slice(0, 8).forEach(t => results['grupos'].add(t.team.id));

  // 32avos: quem passou a fase de grupos vai para os 32avos (ja sabemos)
  // Mas so marcamos como "passou os 32avos" quem ganhou os jogos dos 32avos
  // (ja tratado acima no loop de matches)

  return results;
}

// Proxima fase apos uma vitoria num jogo
function nextFaseId(currentStage) {
  const order = ['grupos','32avos','16avos','8avos','quartos','meias','campeao'];
  const idx = order.indexOf(currentStage);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}

// Converter TLA (codigo 3 letras FIFA) para codigo de bandeira
function tlaToFlagCode(tla, name) {
  const map = {
    // Grupo A
    'MEX':'mx', 'RSA':'za', 'KOR':'kr', 'CZE':'cz',
    // Grupo B
    'CAN':'ca', 'SUI':'ch', 'QAT':'qa', 'ITA':'it',
    // Grupo C
    'BRA':'br', 'MAR':'ma', 'SCO':'gb-sct', 'HAI':'ht',
    // Grupo D
    'USA':'us', 'PAR':'py', 'AUS':'au', 'TUR':'tr',
    // Grupo E
    'GER':'de', 'ECU':'ec', 'CIV':'ci', 'CUW':'cw',
    // Grupo F
    'NED':'nl', 'JPN':'jp', 'TUN':'tn', 'UKR':'ua',
    // Grupo G
    'BEL':'be', 'IRN':'ir', 'EGY':'eg', 'NZL':'nz',
    // Grupo H
    'ESP':'es', 'URU':'uy', 'KSA':'sa', 'CPV':'cv',
    // Grupo I
    'FRA':'fr', 'SEN':'sn', 'NOR':'no', 'IRQ':'iq',
    // Grupo J
    'ARG':'ar', 'AUT':'at', 'ALG':'dz', 'JOR':'jo',
    // Grupo K
    'POR':'pt', 'COL':'co', 'UZB':'uz', 'COD':'cd',
    // Grupo L
    'ENG':'gb-eng', 'CRO':'hr', 'PAN':'pa', 'GHA':'gh',
  };
  return map[tla] || tla?.toLowerCase().slice(0,2) || 'un';
}

// -- FLAGS & AVATAR ---------------------------------
function flagImg(code, size=24) {
  const h = Math.round(size * 0.75);
  // Usar crest da API como fallback se flagcdn falhar
  return `<img src="https://flagcdn.com/${size}x${h}/${(code||'un').toLowerCase()}.png"
    width="${size}" height="${h}"
    style="border-radius:2px;object-fit:cover;vertical-align:middle;flex-shrink:0"
    onerror="this.style.display='none'" alt="${code}">`;
}

function crestImg(crestUrl, size=24) {
  if (!crestUrl) return '';
  return `<img src="${crestUrl}" width="${size}" height="${size}"
    style="object-fit:contain;vertical-align:middle;flex-shrink:0"
    onerror="this.style.display='none'" alt="">`;
}

const AVATAR_COLORS = ['#2d9e58','#c9a020','#e85555','#4a90d9','#9b59b6','#e67e22','#1abc9c','#e84393'];

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return (p.length === 1 ? p[0].slice(0,2) : p[0][0] + p[p.length-1][0]).toUpperCase();
}

function avatarEl(name, color, size=34, fontSize=13) {
  return `<div class="rank-avatar" style="width:${size}px;height:${size}px;font-size:${fontSize}px;background:${color}">${getInitials(name)}</div>`;
}

// -- KICKOFFS (hora de Portugal, UTC+1 verao) -------
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
  return k.toLocaleString('pt-PT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Lisbon' }).replace(',',' -');
}
function timeUntilLock(id) {
  const k = GROUP_KICKOFFS[id]; if (!k) return '';
  const d = k - new Date(); if (d <= 0) return 'Encerrado';
  const days=Math.floor(d/86400000), hours=Math.floor((d%86400000)/3600000), mins=Math.floor((d%3600000)/60000);
  if (days > 0)  return `Fecha em ${days}d ${hours}h`;
  if (hours > 0) return `Fecha em ${hours}h ${mins}m`;
  return `Fecha em ${mins}m`;
}

// -- TOAST ------------------------------------------
let _toastTimer;
function showToast(msg, isErr=false) {
  let el = document.getElementById('toast');
  if (!el) { el=document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent=msg; el.classList.toggle('err',isErr); el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

// -- MODAL ------------------------------------------
function openModal(id)  { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }

// -- AUTH GUARD -------------------------------------
async function requireAuth() {
  const { data:{ session } } = await sb.auth.getSession();
  if (!session) { window.location.href='/'; return null; }
  return session.user;
}

// -- PROFILE ----------------------------------------
async function getOrCreateProfile(user) {
  const { data } = await sb.from('profiles').select('*').eq('id',user.id).single();
  if (data) return data;
  const name  = user.user_metadata?.full_name || user.email.split('@')[0];
  const color = AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
  const { data:c } = await sb.from('profiles').insert({ id:user.id, display_name:name, avatar_color:color }).select().single();
  return c;
}

// -- USER MENU --------------------------------------
function setupUserMenu(profile) {
  const av   = document.getElementById('header-avatar');
  const name = document.getElementById('header-name');
  if (av)   { av.textContent=getInitials(profile.display_name); av.style.background=profile.avatar_color; }
  if (name) name.textContent=profile.display_name.split(' ')[0];
  document.addEventListener('click', e => {
    if (!e.target.closest('#user-badge')) document.getElementById('user-menu')?.classList.remove('open');
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
  });
}

function toggleUserMenu() { document.getElementById('user-menu')?.classList.toggle('open'); }

async function logout() { await sb.auth.signOut(); window.location.href='/'; }

// -- PERFIL MODAL -----------------------------------
function openPerfil(profile) {
  document.getElementById('user-menu')?.classList.remove('open');
  document.getElementById('perfil-name').textContent  = profile.display_name;
  document.getElementById('perfil-email').textContent = profile.email||'';
  document.getElementById('perfil-name-input').value  = profile.display_name;
  const av=document.getElementById('perfil-avatar');
  av.textContent=getInitials(profile.display_name); av.style.background=profile.avatar_color;
  document.getElementById('color-picker').innerHTML=AVATAR_COLORS.map(c=>
    `<div class="color-swatch ${c===profile.avatar_color?'active':''}" style="background:${c}" onclick="selectColor('${c}')"></div>`
  ).join('');
  openModal('modal-perfil');
}
function selectColor(c) {
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.toggle('active',s.style.background===c||s.style.backgroundColor===c));
  document.getElementById('perfil-avatar').style.background=c;
  window._pendingColor=c;
}
async function savePerfil(profile, onSaved) {
  const name  = document.getElementById('perfil-name-input').value.trim();
  const color = window._pendingColor||profile.avatar_color;
  if (!name) { showToast('Introduz um nome',true); return; }
  const { error } = await sb.from('profiles').update({ display_name:name, avatar_color:color }).eq('id',profile.id);
  if (error) { showToast('Erro ao guardar',true); return; }
  profile.display_name=name; profile.avatar_color=color;
  setupUserMenu(profile);
  closeModal('modal-perfil');
  showToast('Perfil atualizado!');
  if (onSaved) onSaved(profile);
}
