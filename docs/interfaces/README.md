# 계층 인터페이스 (Layer Interfaces)

워킹 스켈레톤(TS Launcher + C++ 엔진, 실제 clang/llc + 더미 패스)의 **계층별 계약**. 더미를 실제로
**무중단 교체**하려면 둘이 같은 계약을 지켜야 한다(§9).

## 레이어 지도

```
[외부]  TS Launcher (src/launcher/cli.ts)
          │  CLI 파싱 · 명령셋 · 스테이징 인덱스 · 메시지 렌더
          ▼  ── 01. CLI 경계 (argv in / stdout 토큰 · exit out) ──
[엔진]  main.cpp → driver.cpp     ── 02. 드라이버 (primitive 시퀀서) ──
          │  check / enshell 디스패치 → 고정 순서로 primitive 호출
          ▼
        frontend (clang)  ── LLVM 블랙박스 ──┐
        gate     (IR → 통과|거부)            │
        noising  (IR → IR, L1~L3)            ├ 04. primitive 계약
        harness  (baseline vs 변환)          │ (시그니처 = engine.hpp)
        backend  (llc) ── LLVM 블랙박스 ──────┘
          │
          ▼
        IR = LLVM IR (.ll), primitive 사이를 파일 경로로 전달  ── 03. IR 모델 ──

        harness = EquivalenceHarness (baseline vs 변환, enshell에 상시 내장) ── 05. 하네스 ──
```

## 언어 배치 (확정)

"**외부는 TS Launcher, 실행은 C++ 엔진.**" 자세한 근거는 메모리 `language-layering` /
[`BlackShell_Plan.md`](../BlackShell_Plan.md) §6 '언어 슬롯 셋'.

| 계층 | 지금 (스켈레톤) | 프로덕션 | 비고 |
| --- | --- | --- | --- |
| 외부/패키징/CLI | **TS** | TS/JS | npm·릴리스·version·CLI 파싱·명령 조합·렌더 |
| 엔진 실행(드라이버~파이프라인) | **C++** | C++ (단일 네이티브 바이너리) | 경계 = 서브프로세스(지금) → in-process FFI(프로덕션 후보) |
| 등가검증 하네스 (§6 정확성) | **C++** (`harness.cpp`) | **C++** | 엔진의 일부, 배포됨 (enshell에 내장) |
| 재사용성·AI저항 벤치마크 (§9 페3) | — (미구현) | Python | 별도 dev/CI 도구, 배포 경로 밖 |

## 문서 목록

| # | 문서 | 고정하는 계약 | 척추(§9) |
| --- | --- | --- | --- |
| 01 | [cli-seam](01-cli-seam.md) | Launcher↔엔진 경계: argv in·stdout 토큰·exit code | — |
| 02 | [driver](02-driver.md) | primitive 시퀀서, 파이프라인 순서, 명령 조합 | 척추 ② 드라이버+토글 |
| 03 | [ir-model](03-ir-model.md) | LLVM IR 전달(파일 경로), 격리 메모리 모델 | — |
| 04 | [pass-contract](04-pass-contract.md) | `gate: IR→통과\|거부` / `noising: IR→IR` primitive | 척추 ① 패스 계약 |
| 05 | [verification-harness](05-verification-harness.md) | baseline(L0) vs 변환 결과 일치 검증 | 척추 ③ 등가 하네스 |

## 공통 규약

- **의미 보존이 최상위 불변식** — 어떤 변경도 등가 하네스(05)를 깨면 안 된다.
- **더미→실제에서 바뀌는 건 primitive 몸통뿐** — 계약(경계·문법·IR 전달·시그니처·검증)은 그대로. 각 primitive는 `.cpp` 하나라 다른 곳을 안 건드리고 교체.
- **더미 게이트(accept-all)는 "봉인됨" 거짓 확신** — 출하 전 반드시 실제 게이트로 교체(문서 04).
