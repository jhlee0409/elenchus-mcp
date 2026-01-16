# Elenchus MCP Server

[English](./README.md) | **한국어**

**Verifier↔Critic 토론 루프를 활용한 적대적 코드 검증 시스템**

> **Elenchus** (ἔλεγχος): 체계적 질문을 통해 모순을 드러내어 진실에 도달하는 소크라테스의 논박법.

[![npm version](https://badge.fury.io/js/%40jhlee0409%2Felenchus-mcp.svg)](https://www.npmjs.com/package/@jhlee0409/elenchus-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

---

## 목차

- [개요](#개요)
- [주요 기능](#주요-기능)
- [빠른 시작](#빠른-시작)
- [설치](#설치)
- [사용법](#사용법)
- [MCP 도구 레퍼런스](#mcp-도구-레퍼런스)
- [MCP 리소스](#mcp-리소스)
- [MCP 프롬프트](#mcp-프롬프트-슬래시-커맨드)
- [검증 모드](#검증-모드)
- [자동 검증](#자동-검증-mcp-sampling)
- [이슈 라이프사이클](#이슈-라이프사이클)
- [수렴 감지](#수렴-감지)
- [토큰 최적화](#토큰-최적화)
- [설정](#설정)
- [아키텍처](#아키텍처)
- [보안](#보안)
- [문제 해결](#문제-해결)
- [개발](#개발)
- [라이선스](#라이선스)

---

## 개요

Elenchus는 적대적 코드 검증을 구현하는 **Model Context Protocol (MCP) 서버**입니다. 단순한 린팅이나 정적 분석과 달리, Elenchus는 **Verifier와 Critic 에이전트 간의 토론**을 조율하여 변증법적 추론을 통해 체계적으로 이슈를 발견합니다.

### 왜 적대적 검증인가?

| 전통적 접근 | Elenchus 접근 |
|------------|--------------|
| 단일 패스 분석 | 다중 라운드 토론 |
| 체크리스트 기반 | 의도 기반 시맨틱 분석 |
| 고정된 규칙 | 적응형 수렴 |
| 클린 코드에 침묵 | 명시적 부정 단언 |

### Verifier↔Critic 루프

```
┌──────────────────────────────────────────────────────────────┐
│                       검증 루프                                │
├──────────────────────────────────────────────────────────────┤
│  라운드 1: Verifier → 코드 검토, 이슈 제기                      │
│  라운드 2: Critic   → 이슈 검증 (VALID/INVALID/PARTIAL)        │
│  라운드 3: Verifier → 방어, 해결, 또는 새 이슈 발견             │
│  라운드 4: Critic   → 재평가, 커버리지 확인                     │
│  ...수렴까지 계속...                                           │
│  최종: 판정 (PASS / FAIL / CONDITIONAL)                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 주요 기능

### 🔄 적대적 토론 시스템
- **Verifier**: 증거와 함께 이슈 발견
- **Critic**: 발견 사항 검증, 주장 확인
- **역할 강제**: 준수 점수와 함께 엄격한 교대

### 📊 의도 기반 수렴
- 키워드 매칭 대신 시맨틱 이해
- 5개 카테고리 커버리지 (보안, 정확성, 신뢰성, 유지보수성, 성능)
- 엣지 케이스 문서화 요구
- 클린 코드에 대한 부정 단언

### 🔍 자동 영향 분석
- 의존성 그래프 구축
- 파급 효과 예측
- 케스케이드 깊이 계산
- 위험 수준 평가

### 💾 세션 관리
- 체크포인트/롤백 지원
- 전역 세션 저장소
- 감사 추적 보존

### ⚡ 토큰 최적화 (선택)
- 차분 분석 (변경된 코드만 검증)
- 응답 캐싱
- 선택적 청킹
- 계층화된 검증 파이프라인

---

## 빠른 시작

```bash
# 한 줄 명령으로 설치 (Claude Code CLI)
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp

# Claude Code 재시작 후 자연어로 사용
"src/auth 보안 이슈 검증해줘"

# 또는 MCP 프롬프트 사용
/mcp__elenchus__verify
```

> **참고:** `-s user` 플래그로 모든 프로젝트에서 Elenchus를 사용할 수 있습니다.

---

## 설치

### 지원 클라이언트

| 클라이언트 | 상태 | 비고 |
|-----------|------|------|
| Claude Code (CLI) | ✅ 주요 | 전체 기능 |
| Claude Desktop | ✅ 지원 | 전체 기능 |
| VS Code (Copilot) | ✅ 지원 | v1.102+ 필요 |
| Cursor | ✅ 지원 | 40개 도구 제한 |
| 기타 MCP 클라이언트 | ✅ 호환 | stdio 기반 클라이언트 |

### Claude Code (CLI)

```bash
claude mcp add elenchus -s user -- npx -y @jhlee0409/elenchus-mcp
```

**설치 확인:**
```bash
claude mcp list          # 등록된 서버 목록
claude mcp get elenchus  # 서버 상태 확인
```

### Claude Desktop

설정 파일 편집:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

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

`.vscode/mcp.json`에 추가:

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

### Cursor

**Settings > MCP > Add new global MCP Server**:

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

---

## 사용법

### 자연어 (권장)

검증하고 싶은 내용을 설명하면 됩니다:

```
"src/auth 보안 취약점 검증해줘"
"결제 모듈 엣지 케이스 확인해줘"
"src/api 정확성과 신뢰성 이슈 검토해줘"
```

Claude가 자동으로 Elenchus 도구를 사용합니다.

### 명시적 도구 사용

세밀한 제어가 필요할 때:

```typescript
// 세션 시작
elenchus_start_session({
  target: "src/auth",
  requirements: "인증 보안 감사",
  workingDir: "/path/to/project"
})

// Verifier 라운드 제출
elenchus_submit_round({
  sessionId: "...",
  role: "verifier",
  output: "전체 분석...",
  issuesRaised: [...]
})

// Critic 라운드 제출
elenchus_submit_round({
  sessionId: "...",
  role: "critic",
  output: "검증 결과...",
  issuesResolved: [...]
})

// 세션 종료
elenchus_end_session({
  sessionId: "...",
  verdict: "PASS"
})
```

---

## MCP 도구 레퍼런스

### 세션 라이프사이클

#### `elenchus_start_session`

새 검증 세션 초기화.

**입력:**
- `target` (string, 필수): 검증 대상 경로 (파일 또는 디렉토리)
- `requirements` (string, 필수): 검증 요구사항/집중 영역
- `workingDir` (string, 필수): 상대 경로의 기준 작업 디렉토리
- `maxRounds` (number, 선택): 최대 라운드 (기본: 10)
- `verificationMode` (object, 선택): 모드 설정
  - `mode`: `"standard"` | `"fast-track"` | `"single-pass"`
  - `skipCriticForCleanCode`: boolean
- `differentialConfig` (object, 선택): 변경된 파일만 검증
- `cacheConfig` (object, 선택): 이전 검증 캐싱
- `chunkingConfig` (object, 선택): 큰 파일 청킹
- `pipelineConfig` (object, 선택): 계층화된 검증

**반환:** 세션 ID와 수집된 파일, 의존성 그래프 통계, 역할 설정을 포함한 초기 컨텍스트.

**예시:**
```typescript
elenchus_start_session({
  target: "src/auth",
  requirements: "인증 보안 감사",
  workingDir: "/path/to/project",
  verificationMode: { mode: "fast-track" }
})
```

#### `elenchus_get_context`

파일, 이슈, 선제적 가이던스를 포함한 현재 세션 컨텍스트 조회.

**입력:**
- `sessionId` (string, 필수): 세션 ID

**반환:** 파일, 이슈 요약, 집중 영역, 미검토 파일, 권장사항.

#### `elenchus_submit_round`

Verifier 또는 Critic 라운드 제출.

**입력:**
- `sessionId` (string, 필수): 세션 ID
- `role` (`"verifier"` | `"critic"`, 필수): 이 라운드의 역할
- `output` (string, 필수): 전체 에이전트 분석 출력
- `issuesRaised` (Issue[], 선택): 새 이슈 (Verifier 역할)
- `issuesResolved` (string[], 선택): 해결된 이슈 ID (Critic 역할)

**이슈 스키마:**
```typescript
{
  id: string,
  category: "SECURITY" | "CORRECTNESS" | "RELIABILITY" | "MAINTAINABILITY" | "PERFORMANCE",
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  summary: string,
  location: string,        // "file:line" 형식
  description: string,
  evidence: string         // 코드 스니펫 또는 증거
}
```

**반환:** 라운드 번호, 수렴 상태, 중재자 개입, 역할 준수 점수.

#### `elenchus_end_session`

최종 판정과 함께 세션 종료.

**입력:**
- `sessionId` (string, 필수): 세션 ID
- `verdict` (`"PASS"` | `"FAIL"` | `"CONDITIONAL"`, 필수): 최종 판정

**반환:** 총 라운드, 카테고리별/심각도별 이슈를 포함한 세션 요약.

#### `elenchus_get_issues`

선택적 필터링으로 이슈 조회.

**입력:**
- `sessionId` (string, 필수): 세션 ID
- `status` (`"all"` | `"unresolved"` | `"critical"`, 선택): 상태 필터

**반환:** 필터에 맞는 이슈 배열.

### 상태 관리

#### `elenchus_checkpoint`

롤백을 위한 체크포인트 생성.

**입력:**
- `sessionId` (string, 필수): 세션 ID

**반환:** 성공 상태와 라운드 번호.

#### `elenchus_rollback`

이전 체크포인트로 롤백.

**입력:**
- `sessionId` (string, 필수): 세션 ID
- `toRound` (number, 필수): 롤백할 라운드 번호

**반환:** 성공 상태와 복원된 라운드 번호.

### 분석 도구

#### `elenchus_ripple_effect`

파일 변경의 영향 분석.

**입력:**
- `sessionId` (string, 필수): 세션 ID
- `changedFile` (string, 필수): 변경될 파일
- `changedFunction` (string, 선택): 파일 내 특정 함수

**반환:** 영향받는 파일, 의존성 경로, 케스케이드 깊이, 권장사항.

**예시:**
```typescript
elenchus_ripple_effect({
  sessionId: "...",
  changedFile: "src/auth/login.ts",
  changedFunction: "validateToken"
})
// 반환: { affectedFiles: [...], cascadeDepth: 2, totalAffected: 8 }
```

#### `elenchus_mediator_summary`

중재자 분석 요약 조회.

**입력:**
- `sessionId` (string, 필수): 세션 ID

**반환:** 의존성 그래프 통계, 커버리지 메트릭, 개입 이력.

### 역할 강제

#### `elenchus_get_role_prompt`

역할별 가이드라인 조회.

**입력:**
- `role` (`"verifier"` | `"critic"`, 필수): 프롬프트를 조회할 역할

**반환:** 시스템 프롬프트, 출력 템플릿, 체크리스트, mustDo/mustNotDo 규칙, 집중 영역.

#### `elenchus_role_summary`

세션의 역할 준수 요약 조회.

**입력:**
- `sessionId` (string, 필수): 세션 ID

**반환:** 준수 이력, 평균 점수, 위반 사항, 현재 예상 역할.

#### `elenchus_update_role_config`

역할 강제 설정 업데이트.

**입력:**
- `sessionId` (string, 필수): 세션 ID
- `strictMode` (boolean, 선택): 비준수 라운드 거부
- `minComplianceScore` (number, 선택): 최소 점수 (0-100)
- `requireAlternation` (boolean, 선택): 역할 교대 필수

**반환:** 업데이트된 설정.

### 재검증

#### `elenchus_start_reverification`

이전 세션의 해결된 이슈 재검증 시작.

**입력:**
- `previousSessionId` (string, 필수): 원본 세션 ID
- `workingDir` (string, 필수): 작업 디렉토리
- `targetIssueIds` (string[], 선택): 재검증할 특정 이슈
- `maxRounds` (number, 선택): 최대 라운드 (기본: 6)

**반환:** 대상 이슈에 집중된 컨텍스트와 새 세션 ID.

---

## MCP 리소스

URI 기반 리소스로 세션 데이터 접근:

| URI 패턴 | 설명 |
|----------|------|
| `elenchus://sessions/` | 모든 활성 세션 목록 |
| `elenchus://sessions/{sessionId}` | 특정 세션 상세 정보 |

**사용법:**
```
Read elenchus://sessions/
Read elenchus://sessions/2026-01-17_src-auth_abc123
```

---

## MCP 프롬프트 (슬래시 커맨드)

| 커맨드 | 설명 |
|--------|------|
| `/mcp__elenchus__verify` | 완전한 Verifier↔Critic 루프 실행 |
| `/mcp__elenchus__consolidate` | 우선순위화된 수정 계획 생성 |
| `/mcp__elenchus__apply` | 검증과 함께 수정 적용 |
| `/mcp__elenchus__complete` | 이슈 0까지 전체 파이프라인 |
| `/mcp__elenchus__cross-verify` | 적대적 교차 검증 |
| `/mcp__elenchus__auto-verify` | MCP Sampling을 이용한 **자동** 검증 |

---

## 검증 모드

다양한 용도에 맞는 세 가지 모드:

| 모드 | 최소 라운드 | Critic 필수 | 용도 |
|------|------------|------------|------|
| `standard` | 3 | 예 | 철저한 검증 |
| `fast-track` | 1 | 선택 | 빠른 검증 |
| `single-pass` | 1 | 아니오 | 가장 빠름, Verifier만 |

**예시:**
```typescript
elenchus_start_session({
  target: "src/",
  requirements: "보안 감사",
  workingDir: "/project",
  verificationMode: {
    mode: "fast-track",
    skipCriticForCleanCode: true
  }
})
```

---

## 자동 검증 (MCP Sampling)

Elenchus는 MCP Sampling 기능을 사용하여 **완전 자동 검증**을 지원합니다. 서버가 수동 개입 없이 Verifier↔Critic 토론 루프를 자율적으로 조율합니다.

### 작동 방식

```
┌─────────────────────────────────────────────────────────────┐
│                      자동 검증                                │
├─────────────────────────────────────────────────────────────┤
│  1. 클라이언트가 elenchus_auto_verify 호출                   │
│  2. 서버가 세션과 컨텍스트 생성                              │
│  3. 서버가 MCP Sampling으로 Verifier 완료 요청               │
│  4. 서버가 응답 파싱, 이슈 추출                              │
│  5. 서버가 MCP Sampling으로 Critic 완료 요청                 │
│  6. 서버가 응답 파싱, 이슈 상태 업데이트                     │
│  7. 수렴 또는 최대 라운드까지 반복                           │
│  8. 모든 이슈와 수정 계획을 포함한 최종 결과 반환            │
└─────────────────────────────────────────────────────────────┘
```

### 클라이언트 요구사항

| 기능 | 필수 | 비고 |
|------|------|------|
| MCP Sampling | **예** | 서버 주도 LLM 요청 |
| createMessage | **예** | Sampling 기능의 일부 |

**지원 클라이언트:**
- Claude Code (CLI) - ✅ 완전 지원
- Claude Desktop - ✅ 완전 지원
- 기타 클라이언트 - MCP Sampling 지원 확인 필요

### 도구: `elenchus_auto_verify`

**입력:**
- `target` (string, 필수): 검증 대상 경로
- `requirements` (string, 필수): 검증 요구사항
- `workingDir` (string, 필수): 작업 디렉토리
- `config` (object, 선택):
  - `maxRounds`: 최대 라운드 (기본: 10)
  - `maxTokens`: 요청당 최대 토큰 (기본: 4000)
  - `stopOnCritical`: CRITICAL 이슈 시 중단 (기본: false)
  - `minRounds`: 수렴 전 최소 라운드 (기본: 2)
  - `enableProgress`: 진행 상황 스트리밍 (기본: true)
  - `modelHint`: `"fast"` | `"balanced"` | `"thorough"`
  - `includePreAnalysis`: 정적 분석 포함 (기본: true)
  - `autoConsolidate`: 수정 계획 생성 (기본: true)

**반환:** 세션 ID, 최종 상태, 모든 이슈, 선택적 통합 수정 계획.

**예시:**
```typescript
elenchus_auto_verify({
  target: "src/auth",
  requirements: "인증 모듈 보안 감사",
  workingDir: "/path/to/project",
  config: {
    maxRounds: 10,
    modelHint: "thorough",
    autoConsolidate: true
  }
})
```

### 수동 vs 자동 비교

| 측면 | 수동 (`elenchus_submit_round`) | 자동 (`elenchus_auto_verify`) |
|------|-------------------------------|------------------------------|
| 제어 | 각 라운드 완전 제어 | 서버 제어 |
| 개입 | 라운드 간 수정 가능 | 개입 불가 |
| 클라이언트 작업 | 프롬프트 파싱, LLM 호출, 응답 포맷 | 단일 도구 호출 |
| 용도 | 커스텀 워크플로우, 디버깅 | 표준 검증 |

---

## 이슈 라이프사이클

이슈는 여러 상태를 거칩니다:

```
RAISED → CHALLENGED → RESOLVED
           ↓
        DISMISSED (오탐)
           ↓
        MERGED (병합)
           ↓
        SPLIT (분할)
```

### 이슈 상태

| 상태 | 설명 |
|------|------|
| `RAISED` | Verifier가 최초 발견 |
| `CHALLENGED` | Verifier와 Critic 간 논쟁 중 |
| `RESOLVED` | 수정되고 검증됨 |
| `DISMISSED` | 오탐으로 무효화 |
| `MERGED` | 다른 이슈와 병합 |
| `SPLIT` | 여러 이슈로 분할 |

### Critic 판정

| 판정 | 의미 |
|------|------|
| `VALID` | 이슈가 정당함 |
| `INVALID` | 오탐 |
| `PARTIAL` | 부분적으로 유효, 개선 필요 |

---

## 수렴 감지

세션은 모든 조건이 충족되면 수렴합니다:

```typescript
isConverged =
  criticalUnresolved === 0 &&        // 크리티컬 이슈 없음
  highUnresolved === 0 &&            // 높은 심각도 이슈 없음
  roundsWithoutNewIssues >= 2 &&     // 2라운드 안정
  currentRound >= minRounds &&       // 최소 라운드 완료
  allCategoriesExamined &&           // 5개 카테고리 모두 검토
  issuesStabilized &&                // 최근 전이 없음
  hasEdgeCaseCoverage &&             // 엣지 케이스 문서화
  hasNegativeAssertions &&           // 클린 영역 명시
  hasHighRiskCoverage                // 영향받는 파일 검토 완료
```

### 카테고리 커버리지

5개 카테고리 모두 검토 필수:

1. **SECURITY** - 인증, 권한, 인젝션
2. **CORRECTNESS** - 로직 오류, 타입 불일치
3. **RELIABILITY** - 에러 처리, 리소스 관리
4. **MAINTAINABILITY** - 코드 구조, 문서화
5. **PERFORMANCE** - 효율성, 리소스 사용

<details>
<summary><strong>엣지 케이스 카테고리</strong></summary>

OWASP Testing Guide, Netflix Chaos Engineering, Google DiRT 기반:

| # | 카테고리 | 체크 예시 |
|---|----------|----------|
| 1 | 코드 레벨 | null 입력, 경계값 |
| 2 | 사용자 행동 | 더블클릭, 동시 세션 |
| 3 | 외부 의존성 | 서비스 실패, 타임아웃 |
| 4 | 비즈니스 로직 | 권한 변경, 상태 충돌 |
| 5 | 데이터 상태 | 레거시 데이터, 손상 |
| 6 | 환경 | 설정 드리프트, 리소스 제한 |
| 7 | 스케일 | 트래픽 급증, 대용량 데이터 |
| 8 | 보안 | 유효성 검사 우회, 세션 공격 |
| 9 | 사이드 이펙트 | 작업 중 변경, 부분 실패 |

</details>

---

## 토큰 최적화

<details>
<summary><strong>차분 분석</strong></summary>

변경된 파일만 검증:

```typescript
{
  differentialConfig: {
    enabled: true,
    baseRef: "main"  // main 브랜치와 비교
  }
}
```

</details>

<details>
<summary><strong>응답 캐싱</strong></summary>

이전 검증 결과 캐싱:

```typescript
{
  cacheConfig: {
    enabled: true,
    ttlSeconds: 3600  // 1시간 캐시
  }
}
```

</details>

<details>
<summary><strong>선택적 청킹</strong></summary>

큰 파일을 집중된 청크로 분할:

```typescript
{
  chunkingConfig: {
    enabled: true,
    maxChunkSize: 500  // 청크당 라인 수
  }
}
```

</details>

<details>
<summary><strong>계층화된 파이프라인</strong></summary>

빠른 분석으로 시작, 필요시 에스컬레이션:

```typescript
{
  pipelineConfig: {
    enabled: true,
    startTier: "quick"  // quick → standard → deep
  }
}
```

</details>

---

## 설정

### 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ELENCHUS_DATA_DIR` | 커스텀 저장소 디렉토리 | `~/.elenchus` |
| `XDG_DATA_HOME` | XDG 기본 디렉토리 (Linux/macOS) | - |
| `LOCALAPPDATA` | Windows AppData 위치 | - |

### 저장소 위치

세션과 데이터는 클라이언트 독립적 위치에 저장:

```
~/.elenchus/
├── sessions/          # 검증 세션
├── baselines/         # 차분 분석 베이스라인
├── cache/             # 응답 캐시
└── safeguards/        # 품질 세이프가드 데이터
```

**우선순위:**
1. `$ELENCHUS_DATA_DIR` - 명시적 오버라이드
2. `$XDG_DATA_HOME/elenchus` - XDG 스펙
3. `%LOCALAPPDATA%\elenchus` - Windows
4. `~/.elenchus` - 기본 폴백

### 커스텀 저장소

```bash
# 커스텀 위치 설정
export ELENCHUS_DATA_DIR=/path/to/custom/storage

# 또는 XDG 스펙 사용
export XDG_DATA_HOME=~/.local/share
```

### 세션 정리

세션은 감사 기록으로 보존됩니다. 수동 정리:

```bash
rm -rf ~/.elenchus/sessions/*
# 또는 특정 세션만
rm -rf ~/.elenchus/sessions/2026-01-17_*
```

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ELENCHUS MCP SERVER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     MCP 프로토콜 레이어                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │  │
│  │  │  Tools   │  │Resources │  │ Prompts  │  │ Notifications│ │  │
│  │  │  (18)    │  │  (URI)   │  │   (5)    │  │  (선택)      │ │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘ │  │
│  └───────┼─────────────┼─────────────┼──────────────────────────┘  │
│          │             │             │                              │
│  ┌───────┴─────────────┴─────────────┴──────────────────────────┐  │
│  │                       코어 모듈                                │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │   Session   │  │   Context   │  │  Mediator   │          │  │
│  │  │   Manager   │  │   Manager   │  │   System    │          │  │
│  │  │             │  │             │  │             │          │  │
│  │  │ • 생성      │  │ • Layer 0/1 │  │ • 의존성    │          │  │
│  │  │ • 영속화    │  │ • 사전스캔  │  │ • 파급효과  │          │  │
│  │  │ • 수렴      │  │ • 청킹      │  │ • 개입      │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │    Role     │  │   Issue     │  │  Pipeline   │          │  │
│  │  │ Enforcement │  │  Lifecycle  │  │   (계층화)  │          │  │
│  │  │             │  │             │  │             │          │  │
│  │  │ • Verifier  │  │ • Raised    │  │ • Quick     │          │  │
│  │  │ • Critic    │  │ • Challenged│  │ • Standard  │          │  │
│  │  │ • 검증      │  │ • Resolved  │  │ • Deep      │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│                    ┌──────────────────┐                             │
│                    │     STORAGE      │                             │
│                    │ ~/.elenchus/     │                             │
│                    │   sessions/      │                             │
│                    └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 모듈 책임

| 모듈 | 목적 |
|------|------|
| **Session Manager** | 검증 세션 생성, 영속화, 관리 |
| **Context Manager** | 대상 파일과 의존성 수집 및 조직 |
| **Mediator System** | 의존성 그래프 구축, 이슈 감지, 개입 트리거 |
| **Role Enforcement** | Verifier↔Critic 교대 보장, 준수 검증 |
| **Issue Lifecycle** | RAISED에서 RESOLVED까지 이슈 상태 추적 |
| **Pipeline** | 계층화된 검증 (quick → standard → deep) |

---

## 보안

### 보안 모델

Elenchus는 다음 보안 사항을 고려하여 운영됩니다:

- **코드 실행 없음**: Elenchus는 검증하는 코드를 실행하지 않습니다. 정적 분석만 수행합니다.
- **로컬 저장소**: 모든 세션 데이터는 `~/.elenchus/`에 로컬로 저장됩니다. 외부 서버로 데이터가 전송되지 않습니다.
- **경로 검증**: 모든 파일 경로는 경로 탐색 공격을 방지하기 위해 검증됩니다.
- **출력에 비밀 없음**: 도구 출력은 민감한 데이터 노출을 방지하기 위해 정제됩니다.

### 경로 탐색 방지

```typescript
// 모든 경로는 정규화되고 검증됨
function validatePath(input: string): string {
  const normalized = path.normalize(input);
  if (normalized.includes("..")) {
    throw new Error("경로 탐색 감지됨");
  }
  return normalized;
}
```

### 권한

Elenchus는 다음을 필요로 합니다:
- 검증을 위한 대상 파일 **읽기 권한**
- 세션 저장을 위한 `~/.elenchus/` **쓰기 권한**

### 보안 이슈 보고

보안 취약점은 [GitHub Security Advisories](https://github.com/jhlee0409/elenchus-mcp/security/advisories)를 통해 보고해 주세요.

---

## 문제 해결

### 일반적인 문제

<details>
<summary><strong>서버를 찾을 수 없음 / 도구 사용 불가</strong></summary>

**증상:** Claude가 Elenchus 명령이나 도구를 인식하지 못함.

**해결책:**
1. 설치 확인:
   ```bash
   claude mcp list
   claude mcp get elenchus
   ```
2. 서버 추가 후 Claude Code 재시작
3. 설정 문법 확인 (JSON이 유효해야 함)
4. Node.js ≥18 설치 확인:
   ```bash
   node --version
   ```

</details>

<details>
<summary><strong>세션을 찾을 수 없음</strong></summary>

**증상:** "Session not found: xxx" 오류

**해결책:**
1. 활성 세션 목록 확인:
   ```
   Read elenchus://sessions/
   ```
2. 세션이 정리되었을 수 있음 - 새 세션 시작
3. 세션 ID 오타 확인

</details>

<details>
<summary><strong>MCP Sampling 미지원</strong></summary>

**증상:** `elenchus_auto_verify`가 sampling 오류로 실패.

**해결책:**
1. 클라이언트가 MCP Sampling을 지원하는지 확인:
   - Claude Code CLI: ✅ 지원
   - Claude Desktop: ✅ 지원
   - 기타 클라이언트: 문서 확인
2. 대신 수동 검증 사용:
   ```typescript
   elenchus_start_session(...)
   elenchus_submit_round(...)
   ```

</details>

<details>
<summary><strong>권한 거부 오류</strong></summary>

**증상:** 파일 읽기 또는 세션 쓰기 불가.

**해결책:**
1. 대상 디렉토리 파일 권한 확인
2. `~/.elenchus/` 쓰기 권한 확인:
   ```bash
   ls -la ~/.elenchus/
   ```
3. 커스텀 저장소 위치 시도:
   ```bash
   export ELENCHUS_DATA_DIR=/tmp/elenchus
   ```

</details>

<details>
<summary><strong>역할 준수 거부</strong></summary>

**증상:** 준수 점수로 인해 라운드 거부.

**해결책:**
1. 현재 역할 요구사항 확인:
   ```typescript
   elenchus_get_role_prompt({ role: "verifier" })
   ```
2. 최소 준수 점수 낮추기:
   ```typescript
   elenchus_update_role_config({
     sessionId: "...",
     minComplianceScore: 50,
     strictMode: false
   })
   ```
3. 역할 교대 확인 (Verifier → Critic → Verifier)

</details>

### 디버깅

MCP Inspector로 디버깅:

```bash
npm run inspector
# 또는
npx @modelcontextprotocol/inspector node dist/index.js
```

### 도움 받기

- **이슈**: [GitHub Issues](https://github.com/jhlee0409/elenchus-mcp/issues)
- **토론**: [GitHub Discussions](https://github.com/jhlee0409/elenchus-mcp/discussions)

---

## 개발

### 빌드 명령

```bash
npm run build      # TypeScript를 dist/로 컴파일
npm run dev        # 자동 리빌드 Watch 모드
npm run start      # 컴파일된 서버 실행
npm run inspector  # MCP Inspector 실행 (디버깅)
```

### 프로젝트 구조

```
elenchus-mcp/
├── src/
│   ├── index.ts           # 진입점, MCP 서버 설정
│   ├── tools/             # 도구 정의 및 핸들러
│   ├── resources/         # 리소스 정의
│   ├── prompts/           # 프롬프트 템플릿
│   ├── types/             # TypeScript 인터페이스
│   ├── state/             # 세션 및 컨텍스트 관리
│   ├── mediator/          # 의존성 분석
│   ├── roles/             # 역할 강제
│   ├── config/            # 설정 상수
│   ├── cache/             # 응답 캐싱
│   ├── chunking/          # 코드 청킹
│   ├── diff/              # 차분 분석
│   ├── pipeline/          # 계층화된 검증
│   └── safeguards/        # 품질 세이프가드
├── dist/                  # 컴파일된 출력
├── package.json
├── tsconfig.json
└── README.md
```

### 기여

기여를 환영합니다!
1. 저장소 포크
2. 기능 브랜치 생성
3. 풀 리퀘스트 제출

---

## 라이선스

MIT

---

## 지원

- **이슈**: [GitHub Issues](https://github.com/jhlee0409/elenchus-mcp/issues)
- **토론**: [GitHub Discussions](https://github.com/jhlee0409/elenchus-mcp/discussions)
