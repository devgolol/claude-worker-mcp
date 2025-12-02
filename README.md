# claude-worker-mcp

코디네이터 Claude가 독립 워커 Claude CLI 세션들을 **병렬 제어**하는 MCP 서버.

> 서브에이전트와 다름 - 완전 독립 프로세스, 세션 유지, 중간 개입 가능

## 왜 필요한가?

- **병렬 처리**: 여러 작업을 동시에 실행
- **세션 유지**: 워커별 컨텍스트 유지 (대화 이어가기)
- **역할 분리**: 워커마다 다른 시스템 프롬프트 (코드리뷰어, 테스터, 문서작성자 등)
- **중간 개입**: 작업 중단하고 새 지시 가능

## 설치

```bash
cd claude-worker-mcp
npm install
npm run build

# MCP 등록
claude mcp add claude-worker node /path/to/claude-worker-mcp/dist/index.js
```

## 사용법

### 1. 워커 생성
```
worker_spawn(systemPrompt: "코드 리뷰 전문가. 버그와 개선점만 지적.", workingDir: "/project")
→ { id: "worker_1", status: "idle" }
```

### 2. 작업 지시 (비동기)
```
worker_send(workerId: "worker_1", message: "이 함수 리뷰해줘: ...")
→ { sent: true }
```

### 3. 결과 확인
```
worker_status(workerId: "worker_1")
→ { status: "idle" }  // working이면 아직 처리중

worker_read(workerId: "worker_1")
→ "버그 발견: null 체크 없음..."
```

### 4. 병렬 작업 예시
```
# 워커 3개 생성
worker_spawn(systemPrompt: "코드 리뷰어")  → worker_1
worker_spawn(systemPrompt: "테스트 작성자") → worker_2
worker_spawn(systemPrompt: "문서 작성자")  → worker_3

# 동시에 작업 지시
worker_send(worker_1, "이 코드 리뷰해")
worker_send(worker_2, "이 함수 테스트 작성해")
worker_send(worker_3, "이 API 문서화해")

# 결과 수집
worker_read(worker_1) → 리뷰 결과
worker_read(worker_2) → 테스트 코드
worker_read(worker_3) → API 문서
```

## MCP 도구

| 도구 | 설명 |
|------|------|
| `worker_spawn` | 워커 생성. systemPrompt로 역할 지정 |
| `worker_send` | 메시지 전송 (비동기, 즉시 반환) |
| `worker_read` | 출력 폴링 (새 출력만 반환) |
| `worker_status` | 상태 확인: idle/working/done/error |
| `worker_interrupt` | 작업 중단 후 새 명령 |
| `worker_kill` | 워커 종료 |
| `worker_list` | 활성 워커 목록 |

## 아키텍처

```
[코디네이터 Claude] ←MCP→ [claude-worker-mcp]
                                ↓
              ┌─────────────────┼─────────────────┐
           [Worker1]        [Worker2]        [Worker3]
           (claude CLI)     (claude CLI)     (claude CLI)
           세션 유지         세션 유지         세션 유지
```

## 기술 스택

- Node.js + TypeScript
- @modelcontextprotocol/sdk
- Claude CLI (`--input-format stream-json`)
