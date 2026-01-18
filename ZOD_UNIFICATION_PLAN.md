# Zod 타입 통일화 계획

## 현황 분석

### 문제점
1. **타입 중복**: `src/types/index.ts`와 `src/schemas/issue.ts`에 동일한 타입이 중복 정의됨
2. **타입 불일치 위험**: 수동 TypeScript 인터페이스와 Zod 스키마가 별도로 유지되어 동기화 문제 발생 가능
3. **런타임 검증 부재**: 많은 타입이 Zod 스키마 없이 TypeScript 인터페이스로만 정의됨
4. **분산된 타입 정의**: 10개 이상의 `types.ts` 파일에 타입이 분산됨

### 현재 구조
```
src/
├── schemas/
│   └── issue.ts          # ✅ 좋은 패턴 - Zod 스키마 + z.infer
├── types/
│   └── index.ts          # ❌ 수동 인터페이스 (중복)
├── tools/
│   └── schemas.ts        # ✅ 도구 입력 스키마
├── */types.ts            # ❌ 분산된 모듈별 타입
```

## 통일화 전략

### 원칙
1. **Single Source of Truth**: 모든 타입은 Zod 스키마에서 `z.infer`로 도출
2. **스키마 중심 설계**: 런타임 검증이 필요한 모든 데이터에 Zod 스키마 적용
3. **점진적 마이그레이션**: 빌드 오류 없이 단계별 진행
4. **역호환성 유지**: 기존 export 유지하면서 내부 구현만 변경

### 단계별 계획

## Phase 1: Issue 타입 통일 (src/types/index.ts → src/schemas/issue.ts)

**목표**: `src/types/index.ts`의 Issue 관련 타입을 `src/schemas/issue.ts`에서 re-export

**변경 대상**:
- `Severity` (line 9) → `src/schemas/issue.ts`에서 import
- `IssueCategory` (line 11-16) → `src/schemas/issue.ts`에서 import
- `IssueStatus` (line 19-26) → `src/schemas/issue.ts`에서 import
- `IssueTransitionType` (line 29-37) → `src/schemas/issue.ts`에서 import
- `IssueTransitionRecord` (line 40-51) → `IssueTransition`으로 교체
- `Issue` (line 53-83) → `IssueStorage`로 교체

**액션**:
```typescript
// src/types/index.ts 변경
export {
  Severity,
  IssueCategory,
  IssueStatus,
  IssueTransitionType,
  IssueTransition as IssueTransitionRecord,
  IssueStorage as Issue,
  // ... 기타 스키마 타입
} from '../schemas/issue.js';
```

## Phase 2: Session 스키마 생성 (신규)

**목표**: Session 관련 타입을 Zod 스키마로 정의

**신규 파일**: `src/schemas/session.ts`

**스키마 정의 대상**:
- `SessionPhase`
- `SessionStatus`
- `RoundRole`
- `Round`
- `Checkpoint`
- `VerificationModeConfig`
- `Session`

## Phase 3: Config 스키마 통합

**목표**: `src/tools/schemas.ts`의 Config 스키마와 각 모듈의 타입 통합

**통합 대상**:
- `DifferentialConfig` (tools/schemas.ts ↔ diff/types.ts)
- `CacheConfig` (tools/schemas.ts ↔ cache/types.ts)
- `ChunkingConfig` (tools/schemas.ts ↔ chunking/types.ts)
- `PipelineConfig` (tools/schemas.ts ↔ pipeline/types.ts)
- `SafeguardsConfig` (tools/schemas.ts ↔ safeguards/types.ts)

## Phase 4: 안전한 JSON 파싱 유틸리티

**목표**: `JSON.parse()` 후 Zod 검증 패턴 표준화

**신규 파일**: `src/utils/safe-parse.ts`

```typescript
export function safeJsonParse<T>(json: string, schema: z.ZodType<T>): T {
  const parsed = JSON.parse(json);
  return schema.parse(parsed);
}
```

## 실행 순서

1. ✅ 빌드 오류 확인 (완료)
2. ✅ Phase 1: Issue 타입 통일 (완료)
3. ✅ Phase 2: Session 스키마 생성 (완료)
4. ✅ Phase 3: Config 스키마 통합 (완료)
5. ✅ Phase 4: 안전한 JSON 파싱 (완료)
6. ✅ 빌드 및 테스트 (완료)

## 구현 결과

### 생성/수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/schemas/issue.ts` | ImpactedCode, IssueImpactAnalysis Zod 스키마 추가 |
| `src/schemas/session.ts` | **신규** - Session 관련 Zod 스키마 (20+ 스키마) |
| `src/schemas/index.ts` | session.ts export 추가 |
| `src/config/schemas.ts` | **신규** - Config 관련 Zod 스키마 중앙화 |
| `src/types/index.ts` | Issue 타입 중복 제거, Zod 스키마에서 import |
| `src/tools/schemas.ts` | Config 스키마 중앙화된 위치에서 import |
| `src/utils/safe-parse.ts` | **신규** - 안전한 JSON 파싱 유틸리티 |
| `src/utils/index.ts` | safe-parse export 추가 |

### 추가된 Zod 스키마

**Issue 관련 (src/schemas/issue.ts)**
- `ImpactTypeEnum`, `RiskLevelEnum`
- `ImpactedCodeSchema`, `IssueImpactAnalysisSchema`

**Session 관련 (src/schemas/session.ts)**
- Enums: `SessionPhaseEnum`, `SessionStatusEnum`, `RoundRoleEnum`, `VerificationModeEnum`, `VerificationTierEnum`, `FileLayerEnum`, `FileChangeStatusEnum`, `PriorityEnum`, `ComplexityEnum`, `LanguageEnum`, `VerbosityEnum`
- Schemas: `FileContextSchema`, `ContextDeltaSchema`, `VerificationModeConfigSchema`, `VerificationAgendaItemSchema`, `ContextScopeSchema`, `FramingResultSchema`, `RoundSchema`, `CheckpointSchema`, `UserPreferencesSchema`, `ConciseModeConfigSchema`, `TierResultSchema`, `EscalationSchema`, `PipelineStateSchema`, `DynamicRolesStateSchema`, `LLMEvalConfigSchema`, `LLMEvalResultsSchema`

**Config 관련 (src/config/schemas.ts)**
- `VerificationModeSchema`, `DifferentialConfigSchema`, `CacheConfigSchema`, `ChunkingConfigSchema`, `PipelineConfigSchema`, `SafeguardsConfigSchema`, `DynamicRoleConfigSchema`, `LLMEvalConfigSchema`
- Sub-schemas: `VerificationTierSchema`, `SamplingStrategySchema`, `PeriodicConfigSchema`, `ConfidenceConfigSchema`, `SamplingConfigSchema`, `DynamicRoleSamplingParamsSchema`

### 추가된 유틸리티 (src/utils/safe-parse.ts)

- `safeJsonParse<T>()` - JSON 파싱 + Zod 검증 (예외 발생)
- `safeJsonParseSafe<T>()` - JSON 파싱 + Zod 검증 (Result 반환)
- `safeJsonParseWithDefault<T>()` - 실패 시 기본값 반환
- `isValidType<T>()` - 타입 가드
- `assertType<T>()` - 타입 단언
- `parseLLMJsonOutput<T>()` - LLM 출력에서 JSON 추출 및 검증
- `SafeParseError` - 커스텀 에러 클래스

## 예상 효과

1. **타입 안전성 향상**: 런타임 검증과 컴파일타임 타입이 일치
2. **유지보수성 향상**: 단일 소스에서 타입 관리
3. **버그 감소**: Zod 검증으로 잘못된 데이터 조기 발견
4. **코드 중복 제거**: 약 200줄 이상의 중복 타입 정의 제거

## 향후 작업 (Optional)

1. 기존 코드의 `JSON.parse() + as Type` 패턴을 `safeJsonParse()`로 점진적 교체
2. LLM 출력 파싱 코드에 `parseLLMJsonOutput()` 적용
3. Module types.ts 파일들의 타입을 Zod 스키마에서 `z.infer<>`로 점진적 교체
