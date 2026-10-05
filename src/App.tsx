import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_PHRASE, PRESSURE_LABELS, artifact, createState, decodeState, encodeState,
  eraseAt, glyphs, newEdition, pullProof, restoreAt, selectEdition, setPhrase,
  setPressure, undo, type ErasureState, type Pressure,
} from './engine'

interface DebugApi {
  getState: () => ErasureState
  reset: (seed?: number, phrase?: string) => ErasureState
  setPhrase: (phrase: string) => ErasureState
  setPressure: (pressure: Pressure) => ErasureState
  erase: (index: number) => ErasureState
  restore: (index: number) => ErasureState
  undo: () => ErasureState
  pull: () => ErasureState
  newEdition: (pressure?: Pressure) => ErasureState
  selectEdition: (id: number) => ErasureState
  share: () => { token: string; url: string; length: number }
}

declare global { interface Window { __ERASURE__: DebugApi } }

function loadInitial(): { state: ErasureState; invalid: boolean } {
  const token = window.location.hash.startsWith('#proof=') ? window.location.hash.slice(7) : ''
  if (!token) return { state: createState(), invalid: false }
  const state = decodeState(token)
  return { state: state ?? createState(), invalid: !state }
}

const pressureIcons: Record<Pressure, string> = { whisper: '·', truth: '••', rupture: '✦' }

export default function App() {
  const initial = useRef(loadInitial()).current
  const [state, setState] = useState(initial.state)
  const stateRef = useRef(state)
  const [notice, setNotice] = useState(initial.invalid ? '壊れた版は溶かし、新しい活字を組みました。' : '')
  const dragging = useRef(false)

  const commit = useCallback((producer: (current: ErasureState) => ErasureState) => {
    const next = producer(stateRef.current)
    stateRef.current = next
    setState(next)
    return next
  }, [])

  const erase = useCallback((index: number) => commit((current) => eraseAt(current, index)), [commit])

  useEffect(() => {
    const stop = () => { dragging.current = false }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  useEffect(() => {
    window.__ERASURE__ = {
      getState: () => stateRef.current,
      reset: (seed = 61026, phrase) => commit(() => createState(seed, phrase)),
      setPhrase: (phrase) => commit((current) => setPhrase(current, phrase)),
      setPressure: (pressure) => commit((current) => setPressure(current, pressure)),
      erase: (index) => commit((current) => eraseAt(current, index)),
      restore: (index) => commit((current) => restoreAt(current, index)),
      undo: () => commit(undo),
      pull: () => commit(pullProof),
      newEdition: (pressure) => commit((current) => newEdition(current, pressure)),
      selectEdition: (id) => commit((current) => selectEdition(current, id)),
      share: () => {
        const token = encodeState(stateRef.current)
        const url = `${window.location.origin}${window.location.pathname}#proof=${token}`
        return { token, url, length: url.length }
      },
    }
  }, [commit])

  const share = async () => {
    const token = encodeState(stateRef.current)
    const url = `${window.location.origin}${window.location.pathname}#proof=${token}`
    window.history.replaceState(null, '', `#proof=${token}`)
    try {
      await navigator.clipboard.writeText(url)
      setNotice(`版の記録をコピーしました（${url.length}文字）`)
    } catch {
      setNotice(`共有記録をアドレス欄に残しました（${url.length}文字）`)
    }
  }

  const proof = artifact(state)
  const chars = glyphs(state.phrase)
  const erased = new Set(state.erased)

  return (
    <main>
      <header className="masthead">
        <div className="brand"><span className="seal">消</span><div><b>消去活版所</b><small>ERASURE PRESS · 06 OCT 2026</small></div></div>
        <div className="press-status"><i className={state.stage === 'plate' ? 'live' : ''} />{state.stage === 'plate' ? 'PLATE OPEN' : `PROOF ${state.activeEdition ?? state.editions.length}/3`}</div>
      </header>

      {notice && <button className="notice" onClick={() => setNotice('')}>{notice}<span>×</span></button>}

      <section className="intro-line">
        <span>今朝の手順</span>
        <h1>言えない一文を、<em>消してから</em>読む。</h1>
        <p>文字を指でこする。消した跡ではなく、残った言葉が今日の最初の7分になる。</p>
      </section>

      <section className="workspace">
        <aside className="controls panel">
          <div className="step"><span>01</span><b>原稿</b></div>
          <label htmlFor="phrase">いま、言い切れない一文</label>
          <textarea
            id="phrase"
            value={state.phrase}
            maxLength={MAX_PHRASE}
            disabled={state.stage === 'proof'}
            onChange={(event) => commit((current) => setPhrase(current, event.target.value))}
          />
          <small className="count">{chars.length}/{MAX_PHRASE}</small>

          <div className="step pressure-head"><span>02</span><b>圧を選ぶ</b></div>
          <div className="pressure-list">
            {(Object.keys(PRESSURE_LABELS) as Pressure[]).map((pressure) => (
              <button
                key={pressure}
                className={state.pressure === pressure ? `pressure active ${pressure}` : `pressure ${pressure}`}
                disabled={state.stage === 'proof'}
                onClick={() => commit((current) => setPressure(current, pressure))}
              >
                <i>{pressureIcons[pressure]}</i><span><b>{PRESSURE_LABELS[pressure].name}</b><small>{PRESSURE_LABELS[pressure].note}</small></span>
              </button>
            ))}
          </div>

          {state.stage === 'plate' ? (
            <div className="plate-actions">
              <button className="undo" onClick={() => commit(undo)} disabled={!state.history.length}>一手戻す</button>
              <button className="pull" onClick={() => commit(pullProof)} disabled={!state.erased.length}>この版を刷る <span>↓</span></button>
            </div>
          ) : (
            <div className="proof-actions">
              {state.editions.length < 3 && <button className="pull" onClick={() => commit((current) => newEdition(current))}>同じ文でもう一版 <span>↻</span></button>}
              <button className="share" onClick={share}>この版を共有</button>
            </div>
          )}
        </aside>

        <section className={`press-bed panel ${state.stage}`}>
          <div className="bed-head">
            <div><span>03 / PRESS BED</span><b>{state.stage === 'plate' ? '指で文字をこする' : '紙をめくりました'}</b></div>
            <div className="gauge"><i style={{ width: `${Math.round(proof.ratio * 100)}%` }} /><span>{Math.round(proof.ratio * 100)}% 消去</span></div>
          </div>

          {state.stage === 'plate' ? (
            <div className="type-bed" data-erased={state.erased.length}>
              <p className="first-touch">最初の一手 → 一字をクリック、または指で横になぞる</p>
              <div className="glyph-grid" onPointerLeave={() => { dragging.current = false }}>
                {chars.map((char, index) => {
                  const gone = erased.has(index)
                  const space = !char.trim()
                  return (
                    <button
                      key={`${index}-${char}`}
                      className={`${gone ? 'erased' : ''} ${space ? 'space' : ''}`}
                      data-index={index}
                      aria-label={space ? '空白' : `${char}を${gone ? '戻す' : '消す'}`}
                      disabled={space}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId)
                        dragging.current = true
                        if (gone) commit((current) => restoreAt(current, index))
                        else erase(index)
                      }}
                      onPointerEnter={() => { if (dragging.current && !gone) erase(index) }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        if (gone) commit((current) => restoreAt(current, index))
                        else erase(index)
                      }}
                    >
                      <span>{space ? '·' : char}</span><i />
                    </button>
                  )
                })}
              </div>
              <div className="bed-caption"><span>残す {proof.keptCount}</span><span>削る {proof.erasedCount}</span><span>{PRESSURE_LABELS[state.pressure].name}</span></div>
            </div>
          ) : (
            <article className={`proof-sheet pressure-${state.pressure}`}>
              <div className="registration"><span>+</span><span>+</span></div>
              <div className="proof-meta"><span>朝刊 / 私家版</span><b>{proof.serial}</b></div>
              <p className="removed-line" aria-label={`消した文字: ${proof.removed}`}>{proof.removed || ' '}</p>
              <h2>{proof.remaining}</h2>
              <div className="ink-rule" />
              <p className="proof-title">{proof.title}</p>
              <div className="morning-move"><small>朝の最初の7分</small><strong>{proof.firstMove}</strong></div>
              <footer><span>{proof.erasedCount} GLYPHS REMOVED</span><span>{PRESSURE_LABELS[state.pressure].name}</span></footer>
            </article>
          )}
        </section>

        <aside className="archive panel">
          <div className="step"><span>04</span><b>試し刷り棚</b></div>
          <p className="archive-note">圧を変えて最大3版。同じ原稿から、別の本音が残る。</p>
          <div className="edition-stack">
            {state.editions.length === 0 ? (
              <div className="empty-editions"><i>Ⅰ</i><i>Ⅱ</i><i>Ⅲ</i><span>まだ紙は白い</span></div>
            ) : state.editions.map((edition) => {
              const item = artifact(state, edition)
              return (
                <button key={edition.id} className={state.activeEdition === edition.id ? 'edition active' : 'edition'} onClick={() => commit((current) => selectEdition(current, edition.id))}>
                  <span>0{edition.id}</span><div><b>{item.remaining}</b><small>{PRESSURE_LABELS[edition.pressure].name} · {item.erasedCount}字消去</small></div>
                </button>
              )
            })}
          </div>
          <blockquote>“削るのは、言葉を弱くするためじゃない。<br />何を持って朝へ行くか、手で決めるため。”</blockquote>
          <div className="machine-note"><span>DETERMINISTIC</span><span>CLI / DEBUG</span><span>NO NETWORK</span></div>
        </aside>
      </section>
    </main>
  )
}
