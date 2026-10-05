import { artifact, createState, encodeState, eraseAt, pullProof, setPhrase, setPressure, summary, type Pressure } from '../src/engine'

function args(argv: string[]) {
  const result: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]
    if (!raw.startsWith('--')) continue
    const body = raw.slice(2)
    const separator = body.indexOf('=')
    const key = separator >= 0 ? body.slice(0, separator) : body
    const inline = separator >= 0 ? body.slice(separator + 1) : undefined
    result[key] = inline ?? argv[index + 1] ?? ''
    if (inline === undefined && argv[index + 1] && !argv[index + 1].startsWith('--')) index += 1
  }
  return result
}

const input = args(process.argv.slice(2))
const seed = Number(input.seed ?? 61026)
const phrase = input.phrase ?? '怖いけど、今日ここから始めたい。'
const pressure = (['whisper', 'truth', 'rupture'].includes(input.pressure) ? input.pressure : 'truth') as Pressure
const indices = (input.erase ?? '0,1,2').split(',').map(Number).filter(Number.isInteger)

let state = setPressure(setPhrase(createState(seed), phrase), pressure)
for (const index of indices) state = eraseAt(state, index)
state = pullProof(state)
const token = encodeState(state)
console.log(JSON.stringify({ ...summary(state), artifact: artifact(state), token, fullUrlLength: `https://example.test/#proof=${token}`.length }, null, 2))
