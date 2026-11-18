# 01. CLI 경계 (Launcher ↔ 엔진)

> Launcher가 엔진 primitive를 호출하는 경계 — argv in, 토큰 out, exit code.

Launcher(`cli.ts`)가 명령셋을 소유(파싱·스테이징·조합·렌더). 엔진엔 유닛 1개 호출
(`check <path>` / `enshell <path> [--level <csv>] [--out <obj>]`)만 넘기고, 엔진은 토큰 한 줄 + exit code만 반환.
토큰→문구 렌더는 Launcher(`render()`), 엔진은 문구를 모른다.

**프로토콜.** argv `[subcommand, path]` in (`enshell`은 스테이징된 레벨을 `--level L1,L2` 직교 집합으로
뒤에 덧붙임, L0=생략 — 문서 02; `--name`으로 지정된 출력명은 `--out <obj>`로 전달, 생략 시 엔진이 `<stem>.o`)
· stdout 마지막 줄 = 토큰 · stderr inherit · exit code 전파.
엔진은 `spawnSync`(stdio `["inherit","pipe","inherit"]`)로 유닛당 1회 호출. `-v`/`help`는 엔진 없이 Launcher 즉답.

## exit code

| code | 의미 |
| --- | --- |
| 0 | 성공 |
| 1 | 오류 (인자·프론트/백엔드 실패·등가검증 깨짐) |
| 2 | 봉인 거부 (게이트, 격리 조건 — 문서 04) |
| 127 | 엔진 바이너리 없음 (Launcher가 설정) |

## 토큰 → render()

| 토큰 | 렌더(예) |
| --- | --- |
| `gate.ok <src>` / `gate.reject <src>` | `pass: … eligible` / `reject: … ineligible` |
| `sealed <src> <obj>` | `sealed: <src> -> <obj>` |
| `frontend.failed` / `backend.failed` | clang/llc 실패 |
| `verify.broken <src>` | 노이징이 등가성 깸 |
| `arg.one_positional` / `cmd.unknown <c>` | 인자/명령 오류 |
