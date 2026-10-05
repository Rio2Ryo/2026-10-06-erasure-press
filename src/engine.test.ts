import { describe, expect, it } from 'vitest'
import {
  MAX_PHRASE, artifact, createState, decodeState, encodeState, eraseAt,
  glyphs, newEdition, pullProof, selectEdition, setPhrase, setPressure, undo,
} from './engine'

describe('erasure press engine', () => {
  it('changes physical radius by pressure while always preserving a glyph', () => {
    const base = setPhrase(createState(7), 'ABCDE')
    expect(eraseAt(base, 2).erased).toEqual([2])
    expect(eraseAt(setPressure(base, 'truth'), 2).erased).toEqual([1, 2, 3])
    expect(eraseAt(setPressure(base, 'rupture'), 2).erased).toHaveLength(4)
  })

  it('undoes and creates up to three comparable editions', () => {
    let state = eraseAt(createState(9, '言えないこと'), 0)
    state = undo(state)
    expect(state.erased).toEqual([])
    state = pullProof(eraseAt(state, 1))
    state = pullProof(eraseAt(newEdition(state, 'truth'), 2))
    state = pullProof(eraseAt(newEdition(state, 'rupture'), 3))
    expect(state.editions).toHaveLength(3)
    expect(selectEdition(state, 1).erased).toEqual(state.editions[0].erased)
  })

  it('makes the kept fragment causally visible in the morning move', () => {
    let state = createState(12, '怖いけど始めたい')
    for (const index of [0, 1, 2, 3]) state = eraseAt(state, index)
    const proof = artifact(state)
    expect(proof.remaining).toContain('始めたい')
    expect(proof.firstMove).toContain('始めたい')
  })

  it('round-trips hostile and maximum unicode without executable structure', () => {
    const hostile = '<img src=x onerror=alert(1)>🙂'.repeat(3)
    let state = setPhrase(createState(42), hostile)
    state = pullProof(eraseAt(state, 0))
    const token = encodeState(state)
    const decoded = decodeState(token)
    expect(glyphs(state.phrase)).toHaveLength(MAX_PHRASE)
    expect(token.length).toBeLessThanOrEqual(4096)
    expect(decoded).toEqual(state)
  })

  it('rejects malformed and structurally incomplete tokens', () => {
    expect(decodeState('not-base64')).toBeNull()
    expect(decodeState(btoa('{}'))).toBeNull()
    expect(decodeState('a'.repeat(4097))).toBeNull()
  })
})
