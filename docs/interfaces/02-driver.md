# 02. 드라이버 (명령 조합 · 파이프라인 순서)

> 명령 문법·레벨은 Launcher, 봉인 파이프라인(핸드오프 체인)은 엔진 Driver. — 인터페이스 ②.

## 명령 (Launcher 소유)

git 2단계 — `add`로 스테이징 → `enshell`로 전체 봉인(`git commit` 자리).

| 명령 | 역할 | git |
| --- | --- | --- |
| `add <source> [--level N]` | 유닛 스테이징 (N=1..3→누적 집합 `{L1..LN}` 기록, 생략 시 3) | `git add` |
| `drop <source>` | 언스테이징 | `git restore --staged` |
| `list` | 스테이징 목록 | `git status` |
| `enshell` | 스테이징 전체 봉인 → 오브젝트, 완료 후 비움(1-shot) | `git commit` |
| `check <source>` | 게이트만 (미리보기) | — |

스테이징 = `.blackshell/stage.json`, `Unit = { path, levels[], name? }`(`name` = `--name`으로 지정한 출력 stem). 유닛은 소스 파일(`.c`), 프론트엔드(clang)가 IR로 낮춘다.

> **레벨 UX vs 계약:** 사용자 앞문은 단일 다이얼 `--level N`(누적 사다리)이지만, 저장·전달은 직교 집합
> `{L1..LN}`이다. Launcher가 `enshell <path> --level L1,L2`로 집합을 엔진에 전달하고, 엔진 계약은 집합을
> 그대로 유지한다(하네스가 패스별로 켜고 끄며 이분탐색하려면 집합이어야 함). 더미 노이징은 레벨을
> 무시(identity)하므로 지금은 기본 3도 L0과 동일.

## 파이프라인 순서 (엔진 `enshell` = `driver_enshell`, 고정)

```
frontend(Clang) → gate → optimize(LLVM) → [fork] → noising(L1~L3) → codegen(LLVM, pure.o+noised.o) → harness(두 .o 비교) → "sealed"
```

- fork는 Optimization **뒤**: pure = 최적화·무노이즈, noised = 최적화+노이즈. noised.o = 산출물, pure.o = harness 스크래치(삭제).
- 실패 토큰: `frontend.failed` · `gate.reject`(exit 2) · `noising.failed` · `verify.broken` · `backend.failed`. (optimize는 실패 토큰 없음)
- 불변식: 게이트 = 노이징 **앞**(거부 시 중단), harness = codegen **뒤**(두 .o 비교) 상시 내장.
- 각 단계가 같은 계약(인메모리 `llvm::Module` in/out, 문서 04)을 지킨다.

엔진은 문구 대신 토큰 한 줄 + exit code만 내고, 렌더는 Launcher(문서 01).
