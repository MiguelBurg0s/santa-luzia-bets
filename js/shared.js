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
// Grupos estaticos do Mundial 2026 (API nao devolve grupos separados no tier gratuito)
// Os resultados sao buscados dinamicamente da API
function getWCGroups() {
  // Grupos oficiais do Mundial 2026 (sorteio de dezembro 2025)
  const GROUPS = [
    { id:'A', teams:[
      { id:769,  nameKey:'team_Mexico',          tla:'MEX', flag_code:'mx'     },
      { id:815,  nameKey:'team_SouthAfrica',   tla:'RSA', flag_code:'za'     },
      { id:732,  nameKey:'team_SouthKorea',   tla:'KOR', flag_code:'kr'     },
      { id:798,  nameKey:'team_Czechia',         tla:'CZE', flag_code:'cz'     },
    ]},
    { id:'B', teams:[
      { id:759,  nameKey:'team_Canada',          tla:'CAN', flag_code:'ca'     },
      { id:808,  nameKey:'team_Bosnia', tla:'BIH', flag_code:'ba'  },
      { id:8601, nameKey:'team_Qatar',           tla:'QAT', flag_code:'qa'     },
      { id:788,  nameKey:'team_Switzerland',           tla:'SUI', flag_code:'ch'     },
    ]},
    { id:'C', teams:[
      { id:764,  nameKey:'team_Brazil',          tla:'BRA', flag_code:'br'     },
      { id:1996, nameKey:'team_Morocco',        tla:'MAR', flag_code:'ma'     },
      { id:5765, nameKey:'team_Haiti',           tla:'HAI', flag_code:'ht'     },
      { id:833,  nameKey:'team_Scotland',         tla:'SCO', flag_code:'gb-sct' },
    ]},
    { id:'D', teams:[
      { id:768,  nameKey:'team_USA',             tla:'USA', flag_code:'us'     },
      { id:780,  nameKey:'team_Paraguay',        tla:'PAR', flag_code:'py'     },
      { id:797,  nameKey:'team_Australia',       tla:'AUS', flag_code:'au'     },
      { id:803,  nameKey:'team_Turkey',         tla:'TUR', flag_code:'tr'     },
    ]},
    { id:'E', teams:[
      { id:759,  nameKey:'team_Germany',         tla:'GER', flag_code:'de'     },
      { id:6318, nameKey:'team_Curacao',          tla:'CUW', flag_code:'cw'     },
      { id:1761, nameKey:'team_IvoryCoast', tla:'CIV', flag_code:'ci'     },
      { id:762,  nameKey:'team_Ecuador',         tla:'ECU', flag_code:'ec'     },
    ]},
    { id:'F', teams:[
      { id:786,  nameKey:'team_Netherlands',   tla:'NED', flag_code:'nl'     },
      { id:796,  nameKey:'team_Japan',           tla:'JPN', flag_code:'jp'     },
      { id:790,  nameKey:'team_Sweden',          tla:'SWE', flag_code:'se'     },
      { id:803,  nameKey:'team_Tunisia',         tla:'TUN', flag_code:'tn'     },
    ]},
    { id:'G', teams:[
      { id:805,  nameKey:'team_Belgium',         tla:'BEL', flag_code:'be'     },
      { id:1954, nameKey:'team_Egypt',          tla:'EGY', flag_code:'eg'     },
      { id:793,  nameKey:'team_Iran',            tla:'IRN', flag_code:'ir'     },
      { id:1581, nameKey:'team_NewZealand',   tla:'NZL', flag_code:'nz'     },
    ]},
    { id:'H', teams:[
      { id:760,  nameKey:'team_Spain',         tla:'ESP', flag_code:'es'     },
      { id:6308, nameKey:'team_CapeVerde',      tla:'CPV', flag_code:'cv'     },
      { id:1906, nameKey:'team_SaudiArabia',  tla:'KSA', flag_code:'sa'     },
      { id:780,  nameKey:'team_Uruguay',         tla:'URU', flag_code:'uy'     },
    ]},
    { id:'I', teams:[
      { id:773,  nameKey:'team_France',          tla:'FRA', flag_code:'fr'     },
      { id:907,  nameKey:'team_Senegal',         tla:'SEN', flag_code:'sn'     },
      { id:781,  nameKey:'team_Norway',         tla:'NOR', flag_code:'no'     },
      { id:8475, nameKey:'team_Iraq',          tla:'IRQ', flag_code:'iq'     },
    ]},
    { id:'J', teams:[
      { id:762,  nameKey:'team_Argentina',       tla:'ARG', flag_code:'ar'     },
      { id:816,  nameKey:'team_Austria',         tla:'AUT', flag_code:'at'     },
      { id:1937, nameKey:'team_Algeria',         tla:'ALG', flag_code:'dz'     },
      { id:8487, nameKey:'team_Jordan',        tla:'JOR', flag_code:'jo'     },
    ]},
    { id:'K', teams:[
      { id:765,  nameKey:'team_Portugal',        tla:'POR', flag_code:'pt'     },
      { id:1963, nameKey:'team_DRCongo',        tla:'COD', flag_code:'cd'     },
      { id:9728, nameKey:'team_Uzbekistan',     tla:'UZB', flag_code:'uz'     },
      { id:771,  nameKey:'team_Colombia',        tla:'COL', flag_code:'co'     },
    ]},
    { id:'L', teams:[
      { id:770,  nameKey:'team_England',      tla:'ENG', flag_code:'gb-eng' },
      { id:799,  nameKey:'team_Croatia',         tla:'CRO', flag_code:'hr'     },
      { id:1990, nameKey:'team_Ghana',            tla:'GHA', flag_code:'gh'     },
      { id:800,  nameKey:'team_Panama',          tla:'PAN', flag_code:'pa'     },
    ]},
  ];

  // nameKey ja esta nos objectos via replacements acima
  // name e resolvido no render com t(nameKey)
  return GROUPS.map(g => ({
    ...g,
    label: `Grupo ${g.id}`,
    teams: g.teams.map(team => ({
      ...team,
      crest: null,
    }))
  }));
}

// fetchWCGroups agora retorna os dados estaticos
async function fetchWCGroups() {
  return getWCGroups();
}

// MODO DE TESTE: simula resultados sem depender da API
// Chama esta funcao na consola do browser para testar o ranking
// window.testMode(true) para activar, window.testMode(false) para desactivar
window.testMode = function(active) {
  if (active) {
    sessionStorage.setItem('testResults', JSON.stringify({
      grupos:  [769, 774, 732, 764, 770, 765, 786, 762, 773, 760, 805, 768],
      '32avos':[769, 764, 770, 765, 786, 762, 773, 760, 805, 768, 759, 788],
      '16avos':[769, 764, 770, 765, 773, 760, 805, 768],
      '8avos': [769, 764, 770, 773, 760],
      quartos: [769, 770, 760],
      meias:   [770, 760],
      campeao: [770],
    }));
    console.log('Modo de teste ACTIVADO - recarrega a pagina');
  } else {
    sessionStorage.removeItem('testResults');
    console.log('Modo de teste DESACTIVADO - recarrega a pagina');
  }
};

// Busca todos os jogos do WC e calcula quem passou cada fase
// Retorna: { [faseId]: Set<teamId> }
async function fetchWCResults() {
  // Verificar modo de teste
  const testData = sessionStorage.getItem('testResults');
  if (testData) {
    console.log('MODO DE TESTE activo');
    const raw = JSON.parse(testData);
    const results = {};
    FASES.forEach(f => results[f.id] = new Set(raw[f.id] || []));
    return results;
  }
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
  if (!code) return '';
  const lower = code.toLowerCase();
  return `<img src="https://flagicons.lipis.dev/flags/4x3/${lower}.svg"
    width="${size}" height="${Math.round(size*0.75)}"
    style="border-radius:2px;object-fit:cover;vertical-align:middle;flex-shrink:0"
    onerror="this.style.display='none'"
    alt="${lower}">`;
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
  const lang = (typeof getLang === 'function') ? getLang() : 'pt';
  const locale = lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : 'en-GB';
  return k.toLocaleString(locale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Lisbon' }).replace(',',' -');
}

function timeUntilLock(id) {
  const k = GROUP_KICKOFFS[id]; if (!k) return '';
  const d = k - new Date();
  if (d <= 0) return typeof t === 'function' ? t('lock_closed') : 'Encerrado';
  const days=Math.floor(d/86400000), hours=Math.floor((d%86400000)/3600000), mins=Math.floor((d%3600000)/60000);
  const prefix = typeof t === 'function' ? t('lock_closes_in') : 'Fecha em';
  const dd = typeof t === 'function' ? t('lock_days')  : 'd';
  const hh = typeof t === 'function' ? t('lock_hours') : 'h';
  const mm = typeof t === 'function' ? t('lock_mins')  : 'm';
  if (days > 0)  return `${prefix} ${days}${dd} ${hours}${hh}`;
  if (hours > 0) return `${prefix} ${hours}${hh} ${mins}${mm}`;
  return `${prefix} ${mins}${mm}`;
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
  // Language selector
  const langPicker = document.getElementById('lang-picker');
  if (langPicker) {
    const langs = [
      { code:'pt', label:'🇵🇹 Português' },
      { code:'en', label:'🇬🇧 English'   },
      { code:'es', label:'🇪🇸 Español'   },
    ];
    const curLang = getLang();
    langPicker.innerHTML = langs.map(l => {
      const active = curLang === l.code;
      return `<button onclick="selectLangBtn('${l.code}', this)"
        style="flex:1;padding:8px;border-radius:8px;
               border:.5px solid ${active?'var(--gold)':'var(--border2)'};
               background:${active?'rgba(245,200,66,0.1)':'var(--card2)'};
               color:${active?'var(--gold)':'var(--muted)'};
               font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;transition:all .15s">
        ${l.label}
      </button>`;
    }).join('');
  }
  openModal('modal-perfil');
}
function selectLangBtn(lang, btn) {
  // Update visual immediately without closing modal
  const picker = document.getElementById('lang-picker');
  if (picker) {
    picker.querySelectorAll('button').forEach(b => {
      const active = b === btn;
      b.style.border    = `.5px solid ${active?'var(--gold)':'var(--border2)'}`;
      b.style.background= active ? 'rgba(245,200,66,0.1)' : 'var(--card2)';
      b.style.color     = active ? 'var(--gold)' : 'var(--muted)';
    });
  }
  // Change language
  if (typeof changeLang === 'function') changeLang(lang);
  else setLang(lang);
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
