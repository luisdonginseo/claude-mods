import { describe, expect, mock, test } from 'claude-code/testing'

import { asGlossary, onlyNew, parseTerms } from './terms'

const LONG = '이 브랜치는 워크트리에서 작업하고, 디스커버리 결과는 해시로 확인했습니다. '.repeat(3)
const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}
const USAGE = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

describe('terms', () => {
  test('parseTerms reads a JSON array inside extra text and drops bad items', async () => {
    const got = parseTerms('결과: [{"term":"해시","plain":"내용을 짧은 지문으로 줄인 값."},{"term":1},{"plain":"x"}] 끝')
    expect(got).toEqual([{ term: '해시', plain: '내용을 짧은 지문으로 줄인 값.' }])
    expect(parseTerms('없음')).toEqual([])
    expect(parseTerms('[oops')).toEqual([])
  })

  test('onlyNew skips known terms case-insensitively and duplicates', async () => {
    const glossary = asGlossary({ hash: { term: 'Hash', plain: 'p', seenAt: 1 } })
    const got = onlyNew(
      [
        { term: 'hash', plain: 'a' },
        { term: '워크트리', plain: 'b' },
        { term: '워크트리', plain: 'c' },
      ],
      glossary,
    )
    expect(got).toEqual([{ term: '워크트리', plain: 'b' }])
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function world(on: any, reply: string, entries: Record<string, unknown> = {}) {
  mock.store(on, entries)
  const clock = mock.clock(on, { now: 1000 })
  const asked: string[] = []
  const toasts: string[] = []
  on('session.start', () => ({ cwd: '/tmp' }))
  on('command.register', (_$: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('model.complete', (_$: unknown, e: { prompt: string }) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true, text: reply, usage: USAGE } }
  })
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  // 플러그인이 그릴 것이 없을 때 엔진 몫으로 넘기는 빈 띠.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, { key: 'engine' })
  })
  on('turn.complete', (_$: unknown, e: { answer: string }) => ({ text: e.answer }))
  return { clock, asked, toasts }
}

test('a main-loop answer becomes a glossary entry after the timer runs', async ($, on) => {
  const w = world(on, '[{"term":"워크트리","plain":"한 저장소를 여러 폴더에 펼쳐 따로 작업하는 기능."}]')
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: true })
  await $.turn.complete({ answer: LONG, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(w.asked.length).toBe(0)
  await w.clock.advance(2000)
  expect(w.asked.length).toBe(1)
  expect(w.asked[0]).toContain('<known></known>')
  expect(w.toasts).toEqual(['새 용어 1개: 워크트리'])
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'term-explainer', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /워크트리/ })).toBeDefined()
    await ui.unmount()
  }
  // 저장된 용어는 다음 호출에서 아는 용어로 넘어가고, 다시 풀이하지 않는다.
  await $.turn.complete({ answer: LONG, durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await w.clock.advance(2000)
  expect(w.asked[1]).toContain('<known>워크트리</known>')
  expect(w.toasts.length).toBe(1)
})

test('subagent turns, short answers and aborted turns call no model', async ($, on) => {
  const w = world(on, '[]')
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: true })
  await $.turn.complete({ answer: LONG, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })
  await $.turn.complete({ answer: '짧음', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await $.turn.complete({ answer: LONG, durationMs: 1, isAborted: true, turnId: 't3', reason: 'aborted' })
  await w.clock.advance(4000)
  expect(w.asked.length).toBe(0)
})

test('terms from earlier sessions are sent as known and kept as they were', async ($, on) => {
  const w = world(on, '[{"term":"워크트리","plain":"다시"}]', {
    glossary: { 워크트리: { term: '워크트리', plain: '처음', seenAt: 1 } },
  })
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: true })
  await $.turn.complete({ answer: LONG, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await w.clock.advance(2000)
  expect(w.asked[0]).toContain('<known>워크트리</known>')
  expect(w.toasts.length).toBe(0)
})

test('the band hides on 닫기 and stays empty before any term', async ($, on) => {
  const w = world(on, '[{"term":"해시","plain":"내용을 짧은 지문으로 줄인 값."}]')
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: true })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'term-explainer', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /해시/ })).toBeUndefined()
    await ui.unmount()
  }
  await $.turn.complete({ answer: LONG, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await w.clock.advance(2000)
  const ui = await $.ui.mount({ plugin: 'term-explainer', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Text', text: /해시/ })).toBeDefined()
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /해시/ })).toBeUndefined()
  await ui.unmount()
})
