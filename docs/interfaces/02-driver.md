# 02. 드라이버 (명령 조합 · 파이프라인 순서)

> 명령 문법·레벨은 Launcher, 봉인 파이프라인 시퀀싱은 엔진 Driver. — §9 척추 ②.

## 명령 (Launcher 소유)

git 2단계 — `add`로 스테이징 → `enshell`로 전체 봉인(`git commit` 자리).

| 명령 | 역할 | git |
| --- | --- | --- |
| `add <source> [--level L]` | 유닛 스테이징 (레벨 기록, 생략 시 `L3`) | `git add` |
| `drop <source>` | 언스테이징 | `git restore --staged` |
| `list` | 스테이징 목록 | `git status` |
| `enshell` | 스테이징 전체 봉인 → 오브젝트, 완료 후 비움(1-shot) | `git commit` |
| `check <source>` | 게이트만 (미리보기) | — |

스테이징 = `.blackshell/stage.json`, `Unit = { path, levels[] }`. 유닛은 소스 파일(`.c`), 프론트엔드(clang)가 IR로 낮춘다.

> ⚠️ **현재 갭:** 레벨은 저장만 되고 엔진 호출(`enshell <path>`)에 전달 안 됨. 더미 노이징이라 무해(기본
> `L3`도 실제론 L0과 동일). 실제 노이징 넣을 때 배선 필요. `shortcut: 레벨 미전달, 실제 노이징 교체 시 배선.`

## 파이프라인 순서 (엔진 `enshell` = `driver_enshell`, 고정)

```
frontend(clang) → gate → noising(L1~L3) → harness(baseline vs 변환) → backend(llc) → "sealed"
```

- 실패 토큰: `frontend.failed` · `gate.reject`(exit 2) · `noising.failed` · `verify.broken` · `backend.failed`.
- 불변식: 게이트 = 노이징 **앞**(거부 시 중단), harness = 노이징 **뒤** 상시 내장.
- 각 단계가 같은 계약(IR 파일 경로 in/out, 문서 04)이라 더미↔실제 무중단 교체.

엔진은 문구 대신 토큰 한 줄 + exit code만 내고, 렌더는 Launcher(문서 01).
