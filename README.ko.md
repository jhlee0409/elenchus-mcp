# Elenchus MCP Server

[English](./README.md) | **한국어**

Verifier↔Critic 루프를 통한 적대적 코드 검증.

> **Elenchus** (ἔλεγχος): 질문을 통한 논박의 소크라테스 방법론.

## 지원 클라이언트

MCP 호환 클라이언트에서 사용 가능:

| 클라이언트 | 상태 | 비고 |
|-----------|------|------|
| Claude Code (CLI) | ✅ 테스트됨 | 주요 개발 타겟 |
| Claude Desktop | ✅ 지원 | 전체 기능 사용 가능 |
| VS Code (Copilot) | ✅ 지원 | v1.102+ 필요 |
| Cursor | ✅ 지원 | 40개 도구 제한 있음 |
| 기타 MCP 클라이언트 | ✅ 호환 | stdio 기반 MCP 클라이언트 |

## 빠른 시작

```bash
# 1. 전역 설치 및 등록 (한 줄)
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp

# 2. Claude Code 재시작 후 사용
/elenchus:verify (MCP)

# 또는 자연어로
"src/auth 보안 이슈 검증해줘"
```

> **참고:** `-s user` 플래그로 모든 프로젝트에서 elenchus를 사용할 수 있습니다. 없으면 현재 디렉토리에서만 적용됩니다.

## 작동 방식

**자연어 → Claude가 Elenchus 도구를 자동으로 사용**

```
사용자: "src/auth 보안 이슈 검증해줘"
Claude: (elenchus_start_session, elenchus_submit_round 등 호출)
```

기본 사용 시 슬래시 커맨드 불필요.

## 설치

### Claude Code (CLI)

**옵션 1: 한 줄 명령 (권장)**

```bash
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp
```

> **참고:** `-s user`는 모든 프로젝트에서 사용 가능하게 합니다. 없으면 현재 디렉토리에서만 적용.

**옵션 2: 글로벌 설치 (더 빠른 시작)**

```bash
npm install -g @jhlee0409/elenchus-mcp
claude mcp add elenchus -s user -- elenchus-mcp
```

**확인:**
```bash
claude mcp list          # 등록된 서버 확인
claude mcp get elenchus  # 상태 확인
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 또는 `%APPDATA%\Claude\claude_desktop_config.json` (Windows) 편집:

```json
{
  "mcpServers": {
    "elenchus": {
      "command": "npx",
      "args": ["-y", "@jhlee0409/elenchus-mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot)

`.vscode/mcp.json` (워크스페이스) 또는 User Settings (전역)에 추가:

```json
{
  "mcp": {
    "servers": {
      "elenchus": {
        "command": "npx",
        "args": ["-y", "@jhlee0409/elenchus-mcp"]
      }
    }
  }
}
```

> VS Code 1.102+ 필요

### Cursor

**Settings > MCP > Add new global MCP Server**에서 추가:

```json
{
  "mcpServers": {
    "elenchus": {
      "command": "npx",
      "args": ["-y", "@jhlee0409/elenchus-mcp"]
    }
  }
}
```

> 참고: Cursor는 전체 MCP 서버에 걸쳐 40개 도구 제한이 있습니다.

### 소스에서 빌드 (개발용)

```bash
git clone https://github.com/jhlee0409/elenchus-mcp.git
cd elenchus-mcp
npm install && npm run build

# 클라이언트에 추가:
# command: "node", args: ["/path/to/dist/index.js"]
```

## MCP 프롬프트 (슬래시 커맨드)

명시적 워크플로우 제어를 위한 MCP 프롬프트:

| 커맨드 | 설명 |
|--------|------|
| `/mcp__elenchus__verify` | Verifier↔Critic 루프 실행 |
| `/mcp__elenchus__consolidate` | 우선순위화된 수정 계획 생성 |
| `/mcp__elenchus__apply` | 검증과 함께 수정 적용 |
| `/mcp__elenchus__complete` | 이슈 0까지 전체 파이프라인 |
| `/mcp__elenchus__cross-verify` | 적대적 교차 검증 |

## 도구

### elenchus_start_session

새 검증 세션 시작.

```typescript
{
  target: string,        // 검증 대상 경로
  requirements: string,  // 사용자 요구사항
  workingDir: string,    // 작업 디렉토리
  maxRounds?: number     // 최대 라운드 (기본: 10)
}
```

### elenchus_get_context

현재 검증 컨텍스트 조회.

```typescript
{
  sessionId: string
}
```

### elenchus_submit_round

검증 라운드 결과 제출.

```typescript
{
  sessionId: string,
  role: 'verifier' | 'critic',
  output: string,           // 전체 에이전트 출력
  issuesRaised?: Issue[],   // 발견된 새 이슈
  issuesResolved?: string[] // 해결된 이슈 ID
}
```

### elenchus_get_issues

세션 이슈 조회.

```typescript
{
  sessionId: string,
  status?: 'all' | 'unresolved' | 'critical'
}
```

### elenchus_checkpoint

체크포인트 생성.

```typescript
{
  sessionId: string
}
```

### elenchus_rollback

이전 체크포인트로 롤백.

```typescript
{
  sessionId: string,
  toRound: number
}
```

### elenchus_end_session

세션 종료 및 최종 판정 기록.

```typescript
{
  sessionId: string,
  verdict: 'PASS' | 'FAIL' | 'CONDITIONAL'
}
```

### elenchus_ripple_effect

코드 변경 영향 분석.

```typescript
{
  sessionId: string,
  changedFile: string,     // 변경될 파일
  changedFunction?: string // 특정 함수 (선택)
}
```

### elenchus_mediator_summary

중재자 분석 요약 조회.

```typescript
{
  sessionId: string
}
```

반환: 의존성 그래프 통계, 검증 커버리지, 개입 이력.

### elenchus_get_role_prompt

역할별 프롬프트 및 가이드라인 조회.

```typescript
{
  role: 'verifier' | 'critic'
}
```

반환: mustDo/mustNotDo 규칙, 출력 템플릿, 체크리스트.

### elenchus_role_summary

세션의 역할 강제 요약 조회.

```typescript
{
  sessionId: string
}
```

반환: 준수 이력, 평균 점수, 위반 사항, 다음 예상 역할.

### elenchus_update_role_config

역할 강제 설정 업데이트.

```typescript
{
  sessionId: string,
  strictMode?: boolean,        // 비준수 라운드 거부
  minComplianceScore?: number, // 최소 점수 (0-100)
  requireAlternation?: boolean // Verifier/Critic 교대 필수
}
```

## MCP 리소스

MCP 리소스 URI로 세션 데이터 접근:

| URI | 설명 |
|-----|------|
| `elenchus://sessions/` | 모든 활성 세션 목록 |
| `elenchus://sessions/{sessionId}` | 특정 세션 상세 정보 |

**Claude에서 사용:**
```
# 활성 세션 목록
Read elenchus://sessions/

# 세션 상세 정보
Read elenchus://sessions/2024-01-15_src-auth_abc123
```

## 세션 저장소

세션은 `~/.claude/elenchus/sessions/`에 저장됩니다:

```
~/.claude/elenchus/sessions/
└── 2024-01-15_src-auth_abc123/
    └── session.json
```

### 설계 결정: 글로벌 저장소

세션은 사용자 홈 디렉토리에 **항상 글로벌에 저장**됩니다.

**이유:**
- MCP 서버는 **stdio 기반, 상태 비저장** 아키텍처
- 각 호출은 새 프로세스로 실행되며, `sessionId`만으로 이전 세션을 찾아야 함
- 글로벌 저장소로 **세션 ID 자족성** 보장

### 세션 정리

세션은 **검증 감사 기록**으로 보존됩니다. 수동 정리:

```bash
# 모든 세션 삭제
rm -rf ~/.claude/elenchus/sessions/*

# 특정 세션 삭제
rm -rf ~/.claude/elenchus/sessions/2024-01-15_*
```

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ELENCHUS MCP SERVER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Tools     │  │   State     │  │  Resources  │  │  Prompts  │  │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├───────────┤  │
│  │ start       │  │ Session     │  │ Sessions    │  │ verify    │  │
│  │ get_context │─▶│ Context     │◀─│ (URI-based) │  │ consolidate│ │
│  │ submit_round│  │ Issues      │  │             │  │ apply     │  │
│  │ checkpoint  │  │ Checkpoints │  │             │  │ complete  │  │
│  │ rollback    │  │             │  │             │  │ cross-    │  │
│  │ end         │  │             │  │             │  │  verify   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 주요 기능

### 의도 기반 엣지 케이스 검증

Elenchus는 하드코딩된 키워드 매칭 대신 **의도 기반 검증**을 사용합니다. LLM의 시맨틱 이해 능력을 활용하여 더 유연하고 철저한 검증이 가능합니다.

**9개의 개념적 엣지 케이스 카테고리:**

| # | 카테고리 | 생각할 질문 |
|---|----------|------------|
| 1 | 코드 레벨 | 입력이 null, 빈 값, 경계값이면? |
| 2 | 사용자 행동 | 사용자가 더블클릭, 새로고침, 동시 세션을 사용하면? |
| 3 | 외부 의존성 | 외부 서비스가 실패, 타임아웃, 예상치 못한 데이터를 반환하면? |
| 4 | 비즈니스 로직 | 권한이 변경되거나 상태 전이가 충돌하면? |
| 5 | 데이터 상태 | 데이터가 레거시, 손상, 예상치 못한 형식이면? |
| 6 | 환경 | 설정이 드리프트하거나 리소스가 제한되면? |
| 7 | 스케일 | 트래픽이 100배이거나 데이터가 방대하면? |
| 8 | 보안 | 입력이 유효성 검사를 우회하거나 세션이 공격받으면? |
| 9 | 사이드 이펙트 | 작업 중 상태가 변경되거나 트랜잭션이 부분 실패하면? |

기반: OWASP Testing Guide, Netflix Chaos Engineering, Google DiRT.

### 자동 영향 분석

이슈가 발견되면 Elenchus가 자동으로 영향 정보를 분석하고 첨부합니다:

- **Callers**: 영향받는 코드를 호출하는 함수
- **Dependencies**: 영향받는 영역이 의존하는 코드
- **Related Tests**: 영향받는 코드를 커버하는 테스트 파일
- **Cascade Depth**: 영향의 깊이 (몇 단계까지)
- **Risk Level**: LOW / MEDIUM / HIGH / CRITICAL

고위험 이슈는 영향받는 파일이 검토되었는지 수렴 검증을 트리거합니다.

### 이슈 라이프사이클 관리

이슈는 여러 상태를 거칠 수 있습니다:

| 상태 | 설명 |
|------|------|
| RAISED | 최초 발견 |
| CHALLENGED | 논쟁 중 |
| RESOLVED | 수정 및 검증 완료 |
| DISMISSED | 무효화 (오탐) |
| MERGED | 다른 이슈와 병합 |
| SPLIT | 여러 이슈로 분할 |

### 선제적 중재자

`elenchus_get_context` 도구가 선제적 가이던스를 제공합니다:

- **Focus Areas**: 다음에 검토할 영역
- **Unreviewed Files**: 아직 검토되지 않은 파일
- **Impact Recommendations**: 검증할 고위험 영역
- **Edge Case Gaps**: 누락된 엣지 케이스 커버리지

### 계층화된 컨텍스트

```
Layer 0 (기본): 세션 시작 시 수집
  - 대상 파일
  - 직접 의존성

Layer 1 (발견): 라운드 중 발견
  - 에이전트가 언급한 새 파일
  - 자동 수집 및 추가
```

### 자동 중재자 개입

서버가 자동으로 감지하고 개입:
- `CONTEXT_EXPAND`: 3개 이상의 새 파일 발견
- `LOOP_BREAK`: 동일 이슈 반복 논쟁
- `SOFT_CORRECT`: 범위 과잉 확장

### 의존성 분석 (Mediator)

서버가 의존성 그래프를 구축하고 분석합니다:

**기능:**
- Import/export 관계 추적
- 순환 의존성 탐지
- 파일 중요도 점수 (참조 수 기반)
- 코드 변경 ripple effect 분석

**`elenchus_ripple_effect`로 분석:**
```typescript
// 예시: auth.ts를 변경하면 어떤 파일이 영향받나?
elenchus_ripple_effect({
  sessionId: "...",
  changedFile: "src/auth/auth.ts",
  changedFunction: "validateToken"  // 선택
})
// 반환: 영향받는 파일 목록과 의존성 경로
```

### 수렴 감지

강화된 수렴 조건:

```typescript
isConverged =
  criticalUnresolved === 0 &&
  highUnresolved === 0 &&
  roundsWithoutNewIssues >= 2 &&
  currentRound >= 3 &&
  allCategoriesExamined &&      // 5개 카테고리 전부 검토
  issuesStabilized &&           // 최근 전이 없음
  hasEdgeCaseCoverage &&        // 엣지 케이스 문서화
  hasNegativeAssertions &&      // 클린 영역 명시
  hasHighRiskCoverage           // 영향받는 파일 검토 완료
```

### 역할 강제

서버가 엄격한 Verifier↔Critic 교대를 강제합니다:

```
Round 1: Verifier (항상 시작)
Round 2: Critic
Round 3: Verifier
...
```

**준수 검증:**
- 역할 교대 강제
- 필수 요소 검사 (이슈 형식, 증거)
- 준수 점수 계산 (기본 100, 오류당 -20, 경고당 -5)

**역할별 규칙:**

| 역할 | 필수 | 금지 |
|------|------|------|
| Verifier | 모든 주장에 증거, file:line 위치 | 카테고리 건너뛰기, 모호한 "괜찮음" |
| Critic | 모든 이슈 검증, 커버리지 확인 | 증거 없이 수용, 새 이슈 추가 |

상세 가이드라인은 `elenchus_get_role_prompt`로 조회하세요.

## 개발

```bash
# Watch 모드
npm run dev

# Inspector (MCP 디버깅)
npm run inspector
```

## 라이선스

MIT
