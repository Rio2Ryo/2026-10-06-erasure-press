export const MAX_PHRASE = 48
export const MAX_TOKEN = 4096
export type Pressure = 'whisper' | 'truth' | 'rupture'
export type Stage = 'plate' | 'proof'

export interface Edition {
  id: number
  pressure: Pressure
  erased: number[]
}

export interface ErasureState {
  version: 1
  seed: number
  phrase: string
  pressure: Pressure
  erased: number[]
  history: number[][]
  stage: Stage
  editions: Edition[]
  activeEdition: number | null
}

export interface Artifact {
  remaining: string
  removed: string
  keptCount: number
  erasedCount: number
  ratio: number
  title: string
  firstMove: string
  serial: string
}

export const PRESSURE_LABELS: Record<Pressure, { name: string; note: string; radius: number }> = {
  whisper: { name: '囁き圧', note: '触れた一字だけを削る', radius: 0 },
  truth: { name: '告白圧', note: '触れた字と隣まで削る', radius: 1 },
  rupture: { name: '決裂圧', note: '五字ぶんを一度に剥がす', radius: 2 },
}

const DEFAULT_PHRASE = 'まだ準備不足だけど、ほんとうは今日ここから始めたい。'
const pressures: Pressure[] = ['whisper', 'truth', 'rupture']

export function glyphs(text: string): string[] {
  return Array.from(text.normalize('NFC')).slice(0, MAX_PHRASE)
}

export function normalizePhrase(text: string): string {
  return glyphs(text.replace(/[\r\n\t]+/g, ' ')).join('')
}

export function createState(seed = 61026, phrase = DEFAULT_PHRASE): ErasureState {
  return {
    version: 1,
    seed: clampSeed(seed),
    phrase: normalizePhrase(phrase) || DEFAULT_PHRASE,
    pressure: 'whisper',
    erased: [],
    history: [],
    stage: 'plate',
    editions: [],
    activeEdition: null,
  }
}

export function setPhrase(state: ErasureState, phrase: string): ErasureState {
  const next = normalizePhrase(phrase)
  return { ...state, phrase: next, erased: [], history: [], stage: 'plate', activeEdition: null }
}

export function setPressure(state: ErasureState, pressure: Pressure): ErasureState {
  return pressures.includes(pressure) ? { ...state, pressure } : state
}

function visibleNonSpace(state: ErasureState, erased: Set<number>): number {
  return glyphs(state.phrase).filter((char, index) => char.trim() && !erased.has(index)).length
}

export function eraseAt(state: ErasureState, index: number): ErasureState {
  if (state.stage !== 'plate') return state
  const chars = glyphs(state.phrase)
  if (!Number.isInteger(index) || index < 0 || index >= chars.length) return state
  const erased = new Set(state.erased)
  const before = [...state.erased]
  const radius = PRESSURE_LABELS[state.pressure].radius
  for (let candidate = index - radius; candidate <= index + radius; candidate += 1) {
    if (candidate < 0 || candidate >= chars.length || !chars[candidate].trim()) continue
    const trial = new Set(erased).add(candidate)
    if (visibleNonSpace(state, trial) >= 1) erased.add(candidate)
  }
  const next = [...erased].sort((a, b) => a - b)
  if (next.length === state.erased.length) return state
  return { ...state, erased: next, history: [...state.history, before].slice(-64) }
}

export function restoreAt(state: ErasureState, index: number): ErasureState {
  if (state.stage !== 'plate' || !state.erased.includes(index)) return state
  return { ...state, erased: state.erased.filter((item) => item !== index), history: [...state.history, [...state.erased]].slice(-64) }
}

export function undo(state: ErasureState): ErasureState {
  const previous = state.history.at(-1)
  if (!previous || state.stage !== 'plate') return state
  return { ...state, erased: previous, history: state.history.slice(0, -1) }
}

export function pullProof(state: ErasureState): ErasureState {
  if (state.stage !== 'plate' || state.erased.length === 0) return state
  const edition: Edition = { id: state.editions.length + 1, pressure: state.pressure, erased: [...state.erased] }
  const editions = [...state.editions, edition].slice(-3).map((item, index) => ({ ...item, id: index + 1 }))
  return { ...state, editions, activeEdition: editions.length, stage: 'proof', history: [] }
}

export function newEdition(state: ErasureState, pressure: Pressure = state.pressure): ErasureState {
  return { ...state, pressure, erased: [], history: [], stage: 'plate', activeEdition: null }
}

export function selectEdition(state: ErasureState, id: number): ErasureState {
  const edition = state.editions.find((item) => item.id === id)
  if (!edition) return state
  return { ...state, pressure: edition.pressure, erased: [...edition.erased], stage: 'proof', activeEdition: id }
}

function hash(text: string, seed: number): number {
  let value = seed >>> 0
  for (const char of glyphs(text)) value = Math.imul(value ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0
  return value
}

function compact(text: string, max = 16): string {
  const chars = glyphs(text.trim()).filter((char, index, all) => !(char === ' ' && all[index - 1] === ' '))
  return chars.slice(0, max).join('') || 'まだ消せない一字'
}

export function artifact(state: ErasureState, edition?: Edition): Artifact {
  const erasedList = edition?.erased ?? state.erased
  const pressure = edition?.pressure ?? state.pressure
  const erased = new Set(erasedList)
  const chars = glyphs(state.phrase)
  const remaining = chars.map((char, index) => erased.has(index) ? '' : char).join('').trim()
  const removed = chars.filter((_, index) => erased.has(index)).join('')
  const keptCount = chars.filter((char, index) => char.trim() && !erased.has(index)).length
  const erasedCount = chars.filter((char, index) => char.trim() && erased.has(index)).length
  const total = Math.max(1, keptCount + erasedCount)
  const ratio = erasedCount / total
  const core = compact(remaining)
  const moves: Record<Pressure, string[]> = {
    whisper: [`「${core}」をメモの一行目に置く`, `「${core}」を声に出して一度読む`, `「${core}」だけを誰にも見せず書き直す`],
    truth: [`「${core}」をひとりに送れる下書きにする`, `「${core}」に必要な最初の道具を出す`, `「${core}」を7分だけ予定に入れる`],
    rupture: [`説明より先に「${core}」を一回だけ始める`, `「${core}」を止めている物をひとつ退ける`, `「${core}」の最小版を朝のうちに外へ出す`],
  }
  const titles = ratio < 0.3 ? ['まだ言葉が多い版', '慎重な余白', '小さな欠落'] : ratio < 0.7 ? ['本音の輪郭', '消したぶんだけ近い', '朝に残る骨格'] : ['一字の避難所', 'ほとんど沈黙', '最後の活字']
  const value = hash(`${remaining}:${removed}:${pressure}`, state.seed)
  return {
    remaining,
    removed,
    keptCount,
    erasedCount,
    ratio,
    title: titles[value % titles.length],
    firstMove: moves[pressure][value % moves[pressure].length],
    serial: `EP-${String(state.seed).padStart(6, '0')}-${String(value % 10000).padStart(4, '0')}`,
  }
}

function clampSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.max(0, Math.min(999999, Math.trunc(seed))) : 61026
}

function encodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeUtf8(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

type Payload = [1, number, string, Pressure, number[], [Pressure, number[]][], number | null, 'p' | 'f']

export function encodeState(state: ErasureState): string {
  const payload: Payload = [1, state.seed, state.phrase, state.pressure, state.erased, state.editions.map((item) => [item.pressure, item.erased]), state.activeEdition, state.stage === 'proof' ? 'f' : 'p']
  const token = encodeUtf8(JSON.stringify(payload))
  if (token.length > MAX_TOKEN) throw new Error('共有記録が上限を超えました')
  return token
}

function validIndices(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length <= MAX_PHRASE && new Set(value).size === value.length && value.every((item) => Number.isInteger(item) && item >= 0 && item < length)
}

export function decodeState(token: string): ErasureState | null {
  if (!token || token.length > MAX_TOKEN) return null
  try {
    const value: unknown = JSON.parse(decodeUtf8(token))
    if (!Array.isArray(value) || value.length !== 8) return null
    const [version, seed, rawPhrase, pressure, erased, rawEditions, active, stage] = value
    if (version !== 1 || typeof seed !== 'number' || typeof rawPhrase !== 'string' || !pressures.includes(pressure as Pressure)) return null
    const phrase = normalizePhrase(rawPhrase)
    const length = glyphs(phrase).length
    if (!phrase || rawPhrase !== phrase || !validIndices(erased, length) || !Array.isArray(rawEditions) || rawEditions.length > 3) return null
    const editions: Edition[] = []
    for (const entry of rawEditions) {
      if (!Array.isArray(entry) || entry.length !== 2 || !pressures.includes(entry[0] as Pressure) || !validIndices(entry[1], length)) return null
      editions.push({ id: editions.length + 1, pressure: entry[0] as Pressure, erased: entry[1] })
    }
    if (!(active === null || (Number.isInteger(active) && editions.some((item) => item.id === active))) || (stage !== 'p' && stage !== 'f')) return null
    return { version: 1, seed: clampSeed(seed), phrase, pressure: pressure as Pressure, erased, history: [], editions, activeEdition: active as number | null, stage: stage === 'f' ? 'proof' : 'plate' }
  } catch {
    return null
  }
}

export function summary(state: ErasureState) {
  const proof = artifact(state)
  return {
    seed: state.seed,
    stage: state.stage,
    pressure: state.pressure,
    original: state.phrase,
    remaining: proof.remaining,
    removed: proof.removed,
    erasedCount: proof.erasedCount,
    title: proof.title,
    firstMove: proof.firstMove,
    editions: state.editions.length,
    tokenLength: encodeState(state).length,
  }
}
