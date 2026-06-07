// Coordenadas das principais cidades brasileiras — lookup estático para o marketplace
// Cobre capitais + ~80 cidades de maior população
// Fonte: IBGE / OpenStreetMap. Usado como fallback quando lat/lng não está no DB.

const CITIES = {
  'são paulo|sp':             [-23.5505, -46.6333],
  'rio de janeiro|rj':        [-22.9068, -43.1729],
  'brasília|df':              [-15.7801, -47.9292],
  'salvador|ba':              [-12.9718, -38.5011],
  'fortaleza|ce':             [-3.7172,  -38.5434],
  'belo horizonte|mg':        [-19.9167, -43.9345],
  'manaus|am':                [-3.1190,  -60.0217],
  'curitiba|pr':              [-25.4297, -49.2711],
  'recife|pe':                [-8.0578,  -34.8829],
  'porto alegre|rs':          [-30.0346, -51.2177],
  'belém|pa':                 [-1.4558,  -48.5044],
  'goiânia|go':               [-16.6869, -49.2648],
  'são luís|ma':              [-2.5364,  -44.3056],
  'maceió|al':                [-9.6658,  -35.7353],
  'natal|rn':                 [-5.7945,  -35.2110],
  'teresina|pi':              [-5.0892,  -42.8016],
  'campo grande|ms':          [-20.4428, -54.6460],
  'joão pessoa|pb':           [-7.1195,  -34.8450],
  'aracaju|se':               [-10.9472, -37.0731],
  'porto velho|ro':           [-8.7612,  -63.9039],
  'cuiabá|mt':                [-15.5989, -56.0949],
  'macapá|ap':                [0.0356,   -51.0705],
  'rio branco|ac':            [-9.9754,  -67.8249],
  'boa vista|rr':             [2.8235,   -60.6758],
  'florianópolis|sc':         [-27.5954, -48.5480],
  'vitória|es':               [-20.3155, -40.3128],
  'palmas|to':                [-10.1689, -48.3317],
  // Grandes cidades não capitais
  'guarulhos|sp':             [-23.4543, -46.5338],
  'campinas|sp':              [-22.9056, -47.0608],
  'são bernardo do campo|sp': [-23.6939, -46.5650],
  'são paulo|sp':             [-23.5505, -46.6333],
  'ribeirão preto|sp':        [-21.1767, -47.8208],
  'osasco|sp':                [-23.5324, -46.7919],
  'santo andré|sp':           [-23.6639, -46.5383],
  'são josé dos campos|sp':   [-23.1794, -45.8869],
  'sorocaba|sp':              [-23.5015, -47.4526],
  'mogi das cruzes|sp':       [-23.5224, -46.1872],
  'santos|sp':                [-23.9618, -46.3322],
  'uberlândia|mg':            [-18.9186, -48.2772],
  'contagem|mg':              [-19.9317, -44.0536],
  'juiz de fora|mg':          [-21.7642, -43.3503],
  'aparecida de goiânia|go':  [-16.8233, -49.2440],
  'feira de santana|ba':      [-12.2664, -38.9663],
  'niterói|rj':               [-22.8833, -43.1036],
  'nova iguaçu|rj':           [-22.7592, -43.4511],
  'duque de caxias|rj':       [-22.7856, -43.3117],
  'joinville|sc':             [-26.3044, -48.8457],
  'londrina|pr':              [-23.3045, -51.1696],
  'maringá|pr':               [-23.4205, -51.9333],
  'ananindeua|pa':            [-1.3656,  -48.3721],
  'caxias do sul|rs':         [-29.1678, -51.1794],
  'macaé|rj':                 [-22.3701, -41.7869],
  'pelotas|rs':               [-31.7654, -52.3376],
  'caruaru|pe':               [-8.2760,  -35.9753],
  'betim|mg':                 [-19.9681, -44.1983],
  'montes claros|mg':         [-16.7286, -43.8617],
  'caucaia|ce':               [-3.7386,  -38.6533],
  'marabá|pa':                [-5.3686,  -49.1178],
  'mauá|sp':                  [-23.6678, -46.4617],
  'carapicuíba|sp':           [-23.5224, -46.8353],
  'itaquaquecetuba|sp':       [-23.4867, -46.3489],
  'olinda|pe':                [-7.9997,  -34.8461],
  'jundiaí|sp':               [-23.1864, -46.8964],
  'caxias|ma':                [-4.8592,  -43.3558],
  'piracicaba|sp':            [-22.7253, -47.6492],
  'anápolis|go':              [-16.3281, -48.9528],
  'porto seguro|ba':          [-16.4497, -39.0648],
  'santarém|pa':              [-2.4431,  -54.7081],
  'castanhal|pa':             [-1.2944,  -47.9261],
  'são gonçalo|rj':           [-22.8268, -43.0549],
  'petrolina|pe':             [-9.3989,  -40.5003],
  'juazeiro do norte|ce':     [-7.2145,  -39.3153],
  'mossoró|rn':               [-5.1878,  -37.3438],
  'volta redonda|rj':         [-22.5231, -44.1038],
  'blumenau|sc':              [-26.9194, -49.0661],
  'franca|sp':                [-20.5386, -47.4008],
  'ponta grossa|pr':          [-25.0916, -50.1659],
  'bauru|sp':                 [-22.3246, -49.0784],
  'camaçari|ba':              [-12.6997, -38.3239],
  'vitória da conquista|ba':  [-14.8619, -40.8442],
  'imperatriz|ma':            [-5.5253,  -47.4744],
  'cascavel|pr':              [-24.9578, -53.4595],
  'lauro de freitas|ba':      [-12.8978, -38.3292],
  'mogi guaçu|sp':            [-22.3697, -46.9453],
  'praia grande|sp':          [-24.0056, -46.4024],
  'suzano|sp':                [-23.5425, -46.3111],
}

// Normalize city name for lookup
function cityKey(city, state) {
  return `${(city || '').toLowerCase().trim()}|${(state || '').toLowerCase().trim()}`
}

// Get coordinates for a Brazilian city (returns [lat, lng] or null)
export function getCityCoords(city, state) {
  const key = cityKey(city, state)
  return CITIES[key] || null
}

// Haversine distance in km between two lat/lng points
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = x => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Geocode a CEP using ViaCEP (free, no key) + return city/state
export async function geocodeCep(cep) {
  const clean = cep.replace(/\D/g, '')
  if (clean.length !== 8) throw new Error('CEP inválido')

  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
  if (!res.ok) throw new Error('Erro ao consultar CEP')
  const data = await res.json()
  if (data.erro) throw new Error('CEP não encontrado')

  const city  = data.localidade
  const state = data.uf

  // Lookup coordinates from static table first (fast, no extra request)
  const coords = getCityCoords(city, state)
  if (coords) return { city, state, lat: coords[0], lng: coords[1] }

  // Fallback: Nominatim (OpenStreetMap, free, no key required)
  // User-Agent obrigatório pela política do Nominatim
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)},${state},Brasil&format=json&limit=1`,
      { headers: { 'User-Agent': 'SIGEC-ELOS/1.0 (contato@eqpitech.com.br)' } }
    )
    const geoData = await geoRes.json()
    if (geoData?.[0]) {
      return { city, state, lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) }
    }
  } catch {}

  // Último fallback: coordenadas aproximadas por estado
  return { city, state, lat: null, lng: null }
}
