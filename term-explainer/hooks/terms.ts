import type { Term } from '../types'

// 이름만 담은 용어집. 키는 소문자 용어다(같은 말을 두 번 풀이하지 않는다).
export type Glossary = Record<string, Term>

export const MODEL = 'haiku'
// 짧은 답변에는 풀이할 용어가 거의 없다. 모델 호출을 아낀다.
export const MIN_ANSWER = 40
// 답변 끝부분만 보낸다. 긴 코드 출력으로 비용이 커지지 않게 한다.
export const MAX_ANSWER = 6000
// 이미 아는 용어 목록은 최근 것부터 이만큼만 보낸다.
export const MAX_KNOWN = 400
export const MAX_NEW = 5

export const SYSTEM =
  '너는 개발자가 아닌 사업주에게 기술 용어를 쉽게 풀어 주는 도우미다. ' +
  '반드시 JSON 배열만 답한다. 설명 문장이나 코드 블록 표시를 붙이지 않는다.'

export function buildPrompt(answer: string, known: readonly string[]): string {
  const text = answer.length > MAX_ANSWER ? answer.slice(-MAX_ANSWER) : answer
  return [
    '아래 <answer> 는 개발 도우미가 사업주에게 한 답변이다.',
    `개발자가 아닌 사람이 모를 만한 전문 용어를 최대 ${MAX_NEW}개 골라라.`,
    '',
    '고르는 기준:',
    '- 업계에서 실제로 쓰는 기술 · 개발 용어만 (예: 워크트리, 디스커버리, 해시, 하위 호환).',
    '- 고르지 않는 것: 일상어, 파일 경로, 코드 식별자, 명령어 그 자체, 사람 · 회사 · 제품 이름, 아래 <known> 에 있는 용어.',
    '- 답변에 나온 표기 그대로 적는다.',
    '',
    '각 항목의 "plain" 은 한국어 한두 문장, 60자 안팎. 비유를 써도 된다. 영어 용어를 직역하지 않는다.',
    '',
    '형식: [{"term":"워크트리","plain":"한 저장소를 여러 폴더에 동시에 펼쳐 놓고 따로 작업하는 기능."}]',
    '고를 용어가 없으면 [] 만 답한다.',
    '',
    `<known>${known.join(', ')}</known>`,
    '',
    `<answer>\n${text}\n</answer>`,
  ].join('\n')
}

export function parseTerms(reply: string): { term: string; plain: string }[] {
  const start = reply.indexOf('[')
  const end = reply.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const out: { term: string; plain: string }[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { term, plain } = item as { term?: unknown; plain?: unknown }
    if (typeof term !== 'string' || typeof plain !== 'string') continue
    const t = term.trim()
    const p = plain.trim()
    if (t.length === 0 || t.length > 60 || p.length === 0) continue
    out.push({ term: t, plain: p.slice(0, 200) })
  }
  return out.slice(0, MAX_NEW)
}

export function asGlossary(raw: unknown): Glossary {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Glossary) : {}
}

export const keyOf = (term: string) => term.trim().toLowerCase()

// 용어집에 없는 것만 남긴다. 한 답변 안의 중복도 하나로 친다.
export function onlyNew(found: readonly { term: string; plain: string }[], glossary: Glossary) {
  const seen = new Set(Object.keys(glossary))
  const out: { term: string; plain: string }[] = []
  for (const one of found) {
    const k = keyOf(one.term)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(one)
  }
  return out
}

export function knownTerms(glossary: Glossary): string[] {
  return Object.values(glossary)
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, MAX_KNOWN)
    .map(t => t.term)
}
