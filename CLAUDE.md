# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트: claude-worker-mcp

코디네이터 Claude → 독립 워커 Claude CLI 병렬 제어 MCP.
서브에이전트 아님. 독립 프로세스, 세션 유지, 권한 자동승인.

## 아키텍처
```
[코디네이터] ←MCP→ [claude-worker-mcp]
                         ↓ spawn
         ┌───────────────┼───────────────┐
      [Worker1]      [Worker2]      [Worker N]
      세션유지        세션유지        병렬실행
```

## 핵심
- **세션 유지**: spawn→프로세스 유지, stdin 열림, 다중 메시지
- **비동기**: send 즉시 반환, read로 폴링
- **권한**: `--dangerously-skip-permissions` (Edit/Write/Bash 자동승인)
- **중계**: 워커간 직접통신 없음, 코디네이터가 결과 압축 후 전달

## 통신
```
claude -p '' --input-format stream-json --output-format stream-json --verbose --dangerously-skip-permissions
```

## MCP 도구
| 도구 | 설명 |
|------|------|
| `worker_spawn` | 워커 생성 (systemPrompt로 역할 지정) |
| `worker_send` | 비동기 명령 (즉시 반환) |
| `worker_read` | 출력 폴링 |
| `worker_status` | idle/working/done/error |
| `worker_interrupt` | 중단 후 새 명령 |
| `worker_kill` | 종료 |
| `worker_list` | 목록 |

## 명령어
```bash
cd claude-worker-mcp && npm run build
claude mcp add claude-worker node D:/1-K/claude-worker-mcp/dist/index.js
```

## 언어
Korean 우선
