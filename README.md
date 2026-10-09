# claude-mods

Claude Code 모드(함수 훅 플러그인) 모음이다. 이 저장소 자체가 플러그인 마켓플레이스(`seodongin-mods`)다.

## term-explainer — 용어 풀이

Claude 의 답변에 처음 나온 기술 용어를 개발자가 아닌 사람도 알 수 있게 한국어 한 줄로 풀어 준다.

- 답변이 끝나면 작은 모델(Haiku)이 새 용어를 최대 5개 고른다. 답변이 끝나는 시점은 늦추지 않는다.
- 새 용어는 입력창 위 띠와 알림으로 보인다. "닫기"로 띠를 숨긴다.
- 풀이한 용어는 세션이 바뀌어도 기억해 다시 풀이하지 않는다. `/terms` 로 전체 목록을 패널에서 본다.
- 하위 에이전트의 답변, 짧은 답변, 중단된 답변은 건너뛴다.

## 설치

Claude Code 가 도는 기기마다 한 번 한다(맥 · Windows 터미널). 모드를 쓰려면 Claude Code 가 최신이어야 한다.

```bash
claude update
claude plugin marketplace add luisdonginseo/claude-mods
claude plugin install term-explainer@seodongin-mods --scope user
```

터미널 세션 안에서는 `/plugin install term-explainer --marketplace luisdonginseo/claude-mods` 로도 된다.

## 저장소 단위로 켜기 (클라우드 세션 포함)

저장소의 `.claude/settings.json` 에 넣고 커밋한다.

```json
{
  "extraKnownMarketplaces": {
    "seodongin-mods": { "source": { "source": "github", "repo": "luisdonginseo/claude-mods" } }
  },
  "enabledPlugins": { "term-explainer@seodongin-mods": true }
}
```

## 고친 뒤 반영

```bash
claude plugin marketplace update seodongin-mods
claude plugin update term-explainer@seodongin-mods
```

세션에서 `/reload-plugins`.

## 시험

```bash
claude plugin validate .
claude plugin test term-explainer
```
