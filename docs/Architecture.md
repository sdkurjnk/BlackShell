# BlackShell 아키텍처

> 엔진·파이프라인의 현재 구현 상태. 계층 계약은 [interfaces/](interfaces/).

---

## 1. 계층 개요

**외부는 TS Launcher, 실행은 C++ 엔진.** Launcher(`src/launcher/cli.ts`)가 CLI·명령셋·스테이징·렌더를
소유하고, 유닛마다 엔진 바이너리를 서브프로세스로 띄워 primitive(`check`/`enshell`)를 호출한다. 엔진은
구조화된 토큰 한 줄 + exit code만 돌려주고, 사용자 메시지 렌더는 Launcher가 한다.

```mermaid
flowchart TD
    USER(["사용자 CLI<br/>$ blackshell add add2.c --level 2"]):::user

    subgraph LAUNCHER["Launcher — TS / npm 패키지 (src/launcher/cli.ts)"]
        PARSE["CLI 파싱 · 명령셋<br/>check/add/drop/list/enshell"]:::js
        STAGEMOD["스테이징 인덱스<br/>read/writeStage"]:::js
        RENDER["render(token)<br/>토큰 → 사용자 메시지"]:::js
    end

    subgraph SEAM["경계 (01-cli-seam)"]
        direction LR
        PROTO["프로토콜: argv in · stdout 토큰 한 줄 · exit code<br/>서브프로세스 spawn"]:::seam
    end

    subgraph ENGINE["엔진 — C++ 바이너리 (src/engine/, build/blackshell-engine)"]
        MAIN["main.cpp<br/>명령 dispatch"]:::ours
        DRV["driver.cpp<br/>primitive 시퀀서 (check/enshell)"]:::ours
        FE["frontend.cpp — 임베드 Clang (블랙박스)"]:::box
        GATE["gate.cpp — 격리 조건 (더미 accept-all)"]:::ours
        NOISE["noising.cpp — L1~L3 (더미 identity)"]:::ours
        HARN["harness.cpp — EquivalenceHarness (더미)"]:::ours
        BE["backend.cpp — 임베드 LLVM (블랙박스)"]:::box
    end

    STAGEFILE[(".blackshell/stage.json<br/>git index 유사")]:::state
    OUT[("&lt;name&gt;.o<br/>봉인 산출물 (오브젝트)")]:::out

    USER -->|argv| PARSE
    PARSE --> STAGEMOD
    PARSE -->|"enshell/check <path>"| PROTO
    PROTO --> MAIN --> DRV
    DRV --> FE --> GATE --> NOISE --> HARN --> BE
    BE --> OUT
    STAGEMOD <--> STAGEFILE
    PROTO -->|"토큰 · exit code"| RENDER

    classDef user fill:#eeeeff,stroke:#8888aa,color:#000;
    classDef js fill:#fff3cd,stroke:#d39e00,color:#000;
    classDef seam fill:#f0f0f0,stroke:#999,color:#000,stroke-dasharray:4 3;
    classDef ours fill:#2d2d2d,color:#fff,stroke:#ff9800,stroke-width:2px;
    classDef box fill:#2d2d2d,color:#fff,stroke:#888,stroke-width:2px,stroke-dasharray:4 3;
    classDef state fill:#e8f0fe,stroke:#4285f4,color:#000;
    classDef out fill:#e6ffed,stroke:#22aa77,color:#000;
```

**그림 1. 컴포넌트 계층.** 노랑 = Launcher, 점선 = 경계, 주황 테두리 = 우리 IP primitive,
점선 테두리 = LLVM 블랙박스(임베드 Clang/LLVM). IR(LLVM)은 엔진 안 primitive 사이를 **인메모리 `llvm::Module`**로 오간다.

---

## 2. enshell 파이프라인

봉인 본체(`driver_enshell`). 순서 고정 — `Clang → gate → noising → harness → LLVM → artifact`. 모든 단계가
같은 계약(인메모리 `llvm::Module` in/out)을 지킨다. 등가검증은 플래그가 아니라 상시 내장.

```mermaid
flowchart TD
    START(["enshell &lt;source&gt;"]):::user
    FE["frontend_compile<br/>임베드 Clang → Module"]:::box
    FEFAIL["frontend.failed → exit 1"]:::reject
    GATE{"gate_check (더미 accept-all)<br/>격리 정적검사 자리"}:::ours
    REJ["gate.reject → exit 2"]:::reject
    NOISE["noising_apply L1~L3 (더미 identity, in place)"]:::ours
    NFAIL["noising.failed → exit 1"]:::reject
    VERIFY{"harness_verify<br/>baseline(L0) vs 변환 IR · 상시"}:::verify
    BROKEN["verify.broken → exit 1"]:::reject
    BE["backend_emit<br/>임베드 LLVM → &lt;name&gt;.o"]:::box
    BEFAIL["backend.failed → exit 1"]:::reject
    DONE(["sealed &lt;src&gt; &lt;obj&gt;"]):::out

    START --> FE
    FE -->|실패| FEFAIL
    FE --> GATE
    GATE -->|위반| REJ
    GATE -->|통과| NOISE
    NOISE -->|실패| NFAIL
    NOISE --> VERIFY
    VERIFY -->|불일치| BROKEN
    VERIFY -->|일치| BE
    BE -->|실패| BEFAIL
    BE --> DONE

    classDef user fill:#eeeeff,stroke:#8888aa,color:#000;
    classDef ours fill:#2d2d2d,color:#fff,stroke:#ff9800,stroke-width:2px;
    classDef box fill:#2d2d2d,color:#fff,stroke:#888,stroke-width:2px,stroke-dasharray:4 3;
    classDef reject fill:#ffdddd,stroke:#cc0000,color:#000;
    classDef verify fill:#e6ffed,stroke:#22aa77,color:#000;
    classDef out fill:#fff3cd,stroke:#d39e00,color:#000;
```

**그림 2. enshell 파이프라인.** 게이트 = 노이징 앞 go/no-go, harness = 노이징 뒤 안전망. Launcher의
`enshell`이 스테이징된 유닛마다 엔진 `enshell`을 한 번씩 호출하고 완료 후 스테이징을 비운다(1-shot).

---

## 3. 핵심 설계 원칙

- **경계** — Launcher가 명령셋을 소유, 엔진엔 `[subcommand, path]`(enshell은 `--level` 덧붙임) argv만 넘긴다.
  엔진은 토큰 + exit code만, 렌더는 Launcher(`render()`). (`interfaces/01-cli-seam.md`)
- **primitive 계약** — 시그니처는 `src/engine/engine.hpp`. 각 primitive는 `.cpp` 하나로, 계약은 고정이고
  몸통은 그 파일에 격리된다. (`interfaces/04-pass-contract.md`)
- **더미 상태** — 우리 IP(게이트·노이징·하네스)는 전부 더미. identity noising = 보호 없음,
  accept-all gate = 어떤 유닛도 거부 안 함.
- **구조적 격리** — 외부 메모리 공유를 게이트가 판정하는 자리(현재 더미). (`interfaces/03-ir-model.md`)
- **등가 검증** — baseline(L0) vs 변환을 컴파일·실행해 관측 출력만 비교. 샘플 기반이라 반례 부재이지 증명은
  아니다. (`interfaces/05-verification-harness.md`)

---

## 4. 명령 → 구현 매핑

**Launcher 명령** (`src/launcher/cli.ts`):

| 명령 | 역할 | 구현 |
| --- | --- | --- |
| `check <source>` | 게이트 판정만(미리보기) | `cmdCheck` → 엔진 `check` |
| `add <source> [--level N]` | 유닛 스테이징 (N=1..3→누적 {L1..LN} 기록, 생략 시 3) | `cmdAdd` |
| `drop <source>` | 언스테이징 | `cmdDrop` |
| `list` | 스테이징 목록 | `cmdList` |
| `enshell` | 스테이징 전체 봉인 → 오브젝트 | `cmdEnshell` → 유닛마다 엔진 `enshell` |
| `help` / `-h` / 빈 argv | 사용법 | `USAGE` |
| `-v` / `--version` | 버전(엔진 없이 즉답) | `package.json` |

**엔진 subcommand** (`src/engine/`): `check` → `driver_check`(게이트만), `enshell` → `driver_enshell`(전체).

exit 코드: `0` 정상 · `1` 오류 · `2` 게이트 거부 · `127` 엔진 없음(Launcher가 설정).

> 레벨은 스테이징의 집합(`{L1..LN}`)으로 엔진 `enshell --level L1,L2`에 전달된다. 엔진 계약은 직교 집합을
> 유지하고(하네스 패스별 토글용), 더미 노이징은 레벨을 무시(identity). (`interfaces/02-driver.md`)

