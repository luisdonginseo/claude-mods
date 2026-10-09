import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Term } from '../types'
import {
  MIN_ANSWER,
  MODEL,
  SYSTEM,
  asGlossary,
  buildPrompt,
  keyOf,
  knownTerms,
  onlyNew,
  parseTerms,
} from './terms'

const PANE = 'term-explainer'
const STORE_KEY = 'glossary'
// 입력창 위에 보여 줄 최근 새 용어. 닫기를 누르거나 다음 새 용어가 오면 바뀐다.
const recent = atom({ plugin: 'term-explainer', key: 'recent' } as const, [] as Term[])
const isHidden = atom({ plugin: 'term-explainer', key: 'isHidden' } as const, false)

export const register: Register = on => {
  // 답변이 끝날 때 바로 모델을 부르지 않는다. 큐에 넣고 타이머가 처리한다.
  // 그래야 답변 끝이 모델 호출 시간만큼 늦어지지 않는다.
  const queue: string[] = []
  let isDraining = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'terms',
      description: '지금까지 풀이한 용어 전체를 패널로 연다',
    })

    const drain = async () => {
      if (isDraining) return
      isDraining = true
      try {
        while (queue.length > 0) {
          const answer = queue.shift()!
          const glossary = asGlossary(await $.store.get(STORE_KEY))
          const res = await $.model.complete({
            model: MODEL,
            system: SYSTEM,
            prompt: buildPrompt(answer, knownTerms(glossary)),
            maxTokens: 800,
            effort: 'low',
            timeoutMs: 20000,
          })
          if (!res.isAnswered) {
            $.ui.log(`term-explainer: model call skipped (${res.reason})`)
            continue
          }
          const fresh = onlyNew(parseTerms(res.text), glossary)
          if (fresh.length === 0) continue
          const now = await $.clock.now()
          const terms: Term[] = fresh.map(t => ({ ...t, seenAt: now }))
          // 저장 직전에 다시 읽는다. 다른 세션이 그사이 넣은 용어를 덮어쓰지 않게 한다.
          const latest = asGlossary(await $.store.get(STORE_KEY))
          for (const t of terms) latest[keyOf(t.term)] ??= t
          await $.store.set(STORE_KEY, latest)
          await update($, recent, () => terms)
          await update($, isHidden, () => false)
          $.ui.toast(`새 용어 ${terms.length}개: ${terms.map(t => t.term).join(', ')}`)
        }
      } finally {
        isDraining = false
      }
    }

    $.clock.every(2000, () => {
      if (queue.length > 0) void drain()
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // 하위 에이전트의 답변은 사업주가 직접 읽지 않으므로 건너뛴다.
    if (e.agentId === undefined && e.reason === 'answer' && e.answer.length >= MIN_ANSWER) {
      queue.push(e.answer)
    }
    return result
  })

  on('command.run', { command: 'terms' }, async $ => {
    await $.ui.open({ id: PANE, title: '용어 풀이' })
    return { text: '용어 풀이 패널을 열었습니다.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const terms = await read($, recent)
    if (e.props.hasSurvey || terms.length === 0 || (await read($, isHidden))) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {terms.map(t => (
          <Text key={`t-${t.term}`}>
            <Text bold>{t.term}</Text>
            <Text dimColor> — {t.plain}</Text>
          </Text>
        ))}
        <Button key="hide" label="닫기" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const glossary = asGlossary(await $.store.get(STORE_KEY))
    const all = Object.values(glossary).sort((a, b) => b.seenAt - a.seenAt)
    return (
      <Box flexDirection="column">
        {all.length === 0 && <Text dimColor>아직 풀이한 용어가 없습니다.</Text>}
        {all.map(t => (
          <Text key={`p-${t.term}`}>
            <Text bold>{t.term}</Text>
            <Text dimColor> — {t.plain}</Text>
          </Text>
        ))}
      </Box>
    )
  })
}
