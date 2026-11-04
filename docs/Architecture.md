# BlackShell 아키텍처

작성일: 2026-11-04

> 현재 **PoC 스켈레톤**의 실제 구현 구조를 기록한다. 장기 LLVM 파이프라인 설계는
> [BlackShell_Plan.md §6](BlackShell_Plan.md)을, 이음매 계약은
> [interfaces/](interfaces/)를 참고.

---

## 1. 계층 개요

외부 계층(JS/npm)은 패키징이 소유한 것만 응답하고, 나머지는 전부 내부 엔진으로
넘긴다. 이음매 프로토콜(argv in · stdio inherit · exit code 전파)이 고정이라
PoC Python 엔진을 프로덕션 C-ABI 네이티브 바이너리로 교체해도 JS는 바뀌지 않는다.

```mermaid
flowchart TD
    USER(["사용자 CLI<br/>$ blackshell add add2.ir.json --level L1,L2"]):::user

    subgraph JS["외부 계층 — JS / npm 패키지"]
        BIN["bin/blackshell.js<br/>엔트리포인트 · 엔진 spawn"]:::js
        TRI["src/cli/index.js<br/>triage(argv)"]:::js
    end

    subgraph SEAM["이음매 (01-cli-seam)"]
        direction LR
        PROTO["프로토콜: argv in · stdio inherit · exit code<br/>PoC = Python 서브프로세스 → 프로덕션 = C-ABI 네이티브"]:::seam
    end

    subgraph ENGINE["내부 엔진 — Python PoC → C++ 프로덕션"]
        DRV["driver.py<br/>명령셋 단일 소스 · 유일한 I/O 지점(_emit)"]:::ours
        IR["ir.py<br/>load / validate"]:::ours
        STAGE["stage.py<br/>스테이징 인덱스"]:::ours
        PASS["passes/<br/>GATE + NOISING"]:::ours
        INTERP["interp.py<br/>토이 인터프리터"]:::ours
        HARNESS["harness.py<br/>등가 검증"]:::ours
        MSG["messages.py<br/>메시지 카탈로그 + exit 코드"]:::ours
    end

    STAGEFILE[(".blackshell/stage.json<br/>git index 유사")]:::state
    OUT[("out/*.sealed.json<br/>봉인 산출물")]:::out

    USER -->|argv| BIN
    BIN --> TRI
    TRI -->|"meta: -v/version/빈/-h"| BIN
    TRI -->|"forward: 그 외 전부"| PROTO
    PROTO --> DRV

    DRV --> IR
    DRV --> STAGE
    DRV --> PASS
    DRV --> INTERP
    PASS --> HARNESS
    HARNESS --> INTERP
    DRV --> MSG
    IR -.->|"EngineError raise"| MSG

    STAGE <--> STAGEFILE
    DRV --> OUT

    classDef user fill:#eeeeff,stroke:#8888aa,color:#000;
    classDef js fill:#fff3cd,stroke:#d39e00,color:#000;
    classDef seam fill:#f0f0f0,stroke:#999,color:#000,stroke-dasharray:4 3;
    classDef ours fill:#2d2d2d,color:#fff,stroke:#ff9800,stroke-width:2px;
    classDef state fill:#e8f0fe,stroke:#4285f4,color:#000;
    classDef out fill:#e6ffed,stroke:#22aa77,color:#000;
```

**그림 1. 컴포넌트 계층.** 노랑 = JS 외부 계층(패키징 소유), 점선 = 외부/내부 이음매,
주황 테두리(검정 배경) = 우리가 작성한 내부 엔진, 파랑/초록 = 상태·산출물.

---

## 2. enshell 파이프라인

봉인 본체. 순서는 고정이다 — `load → gate → noising L1→L2→L3 → emit`. 각 유닛은
자신이 선택한 레벨만 거치고, 모든 단계가 동일한 IR 계약을 지키므로 더미 패스를
실제 패스로 교체해도 드라이버는 바뀌지 않는다.

```mermaid
flowchart TD
    START(["enshell [--no-gate] [--emit-ir DIR] [--verify]"]):::user
    LOAD["ir.load_ir(path)<br/>+ baseline(L0) 독립 복사"]:::ours
    GATE{"gate (dummy accept-all)<br/>§5 조건1 정적검사 자리"}:::ours
    REJ["gate.reject → exit 2"]:::reject
    L1["noising L1 (identity)"]:::ours
    L2["noising L2 (identity)"]:::ours
    L3["noising L3 (identity)"]:::ours
    VERIFY{"harness.verify<br/>baseline vs 현재 · 매 패스"}:::verify
    BROKEN["verify.broken → exit 1"]:::reject
    EMIT["out/&lt;name&gt;.sealed.json 기록"]:::out
    CLEAR["stage.clear()<br/>1-shot 소비"]:::ours
    DONE(["enshell.done"]):::user

    START --> LOAD --> GATE
    GATE -->|"위반 (not --no-gate)"| REJ
    GATE -->|"통과"| L1 --> L2 --> L3 --> EMIT --> CLEAR --> DONE
    L1 -.->|"--verify"| VERIFY
    L2 -.->|"--verify"| VERIFY
    L3 -.->|"--verify"| VERIFY
    VERIFY -->|"불일치"| BROKEN

    classDef user fill:#eeeeff,stroke:#8888aa,color:#000;
    classDef ours fill:#2d2d2d,color:#fff,stroke:#ff9800,stroke-width:2px;
    classDef reject fill:#ffdddd,stroke:#cc0000,color:#000;
    classDef verify fill:#e6ffed,stroke:#22aa77,color:#000;
    classDef out fill:#fff3cd,stroke:#d39e00,color:#000;
```

**그림 2. enshell 파이프라인.** 게이트는 노이징 앞의 go/no-go, 등가 검증(`--verify`)은
변환 전체를 가로지르는 안전망. 봉인이 끝나면 스테이징은 소비되어 비워진다.

---

## 3. 핵심 설계 원칙

- **외부/내부 이음매** — JS는 `version`·usage 같은 *패키징이 소유한 것*만 로컬
  응답하고 나머지는 엔진에 그대로 전달한다. 명령셋 파싱을 안 하므로 엔진이
  명령셋의 단일 소스이고, 이음매 프로토콜이 고정이라 PoC→프로덕션 교체 시 JS는
  무변경이다. (`interfaces/01-cli-seam.md`)
- **패스 계약** — `noising: IR→IR`, `gate: IR→Verdict` 두 시그니처. 현재는 전부
  더미다(identity noising = "맞지만 보호 안 됨", accept-all gate = **출하 전 반드시
  교체**). 더미↔실제 교체 시 드라이버는 안 건드리고 레지스트리 엔트리만 swap한다.
  (`interfaces/04-pass-contract.md`)
- **단일 I/O 지점** — 파이프라인 코드(`ir`/`interp`/`passes`)는 절대 print하지 않고
  `EngineError`를 raise만 한다. 렌더링은 `driver._emit` 한 곳, 메시지/스트림/exit
  코드는 `messages.py` 카탈로그에서 조회한다. (`interfaces/02-driver.md`)
- **구조적 격리 (§5 조건1)** — IR에 포인터·전역·I/O가 표현 불가능하므로 격리가
  문법 수준에서 강제된다. (`interfaces/03-ir-model.md`)
- **등가 검증** — baseline(L0)과 변환 결과를 같은 입력으로 돌려 관측 출력(`returns`)만
  비교한다. 내부 레지스터·명령어 수·경로는 노이징이 바꾸는 것이라 비교하지 않는다.
  샘플 기반이라 반례의 부재이지 등가 증명은 아니다. (`interfaces/05-verification-harness.md`)

---

## 4. 명령 → 모듈 매핑

| 명령 | 역할 | 주 사용 모듈 |
| --- | --- | --- |
| `check <ir>` | 게이트 판정만(스테이징 전 미리보기) | `ir`, `passes.GATE` |
| `add <ir> [--level L]` | 유닛을 스테이징 | `ir`, `stage` |
| `drop <ir>` | 언스테이징 | `stage` |
| `list` | 스테이징 목록 | `stage` |
| `enshell [...]` | 스테이징 전체 봉인 → 아티팩트 | `ir`, `passes`, `harness`, `stage` |
| `run <ir> [--input k=v]` | 토이 인터프리터로 유닛 실행 | `ir`, `interp` |
| `help` / 빈 argv | 사용법 | `driver.USAGE` |

exit 코드: `0` 정상 · `1` 오류 · `2` 게이트 거부(BlackShell_Plan §5 조건1) · `127` 엔진 없음(JS가 설정).

---

## 5. 프로덕션 언어 경계 (2026-11-04 확정)

PoC(Python)에서 LLVM 프로덕션으로 올릴 때 **언어 경계는 현재와 동일하게 유지한다** —
얇은 JS 론처 + npm 패키징 / 엔진 전체는 한 언어(C++)로 LLVM과 같은 프로세스 안.
서브프로세스 뒤의 바이너리를 Python → C++로 교체하는 것 외에 JS는 거의 바뀌지 않는다.

**검토 후 기각한 안**: "LLVM 호출부·IR 가공만 C++, 드라이버·스테이징 등 나머지는 JS."

- **경계 기준은 'IR 가공'이 아니라 'IR/LLVM을 만지느냐'다.** 게이트(§5 조건1 정적분석),
  노이징 L1~L3, 등가 검증(baseline/변환을 실제 컴파일·실행해 비교) 모두 LLVM을
  인프로세스로 써야 하므로 전부 C++이다. "IR 가공만"으로 좁히면 게이트가 애매하게 빠진다.
- **드라이버를 JS로 당기면 이음매가 고와진다.** LLVM `Module`은 C++ 메모리에 산다.
  JS가 패스 사이 중간 상태를 들고 있으려면 매 패스마다 bitcode 직렬화 왕복이 생겨,
  파이프라인 한복판에 비싸고 깨지기 쉬운 경계가 박힌다. 이음매는 **유닛 단위로 거칠게**
  유지한다 — 유닛을 통째로 넘기고(in) 봉인 아티팩트를 받는다(out), 횡단은 들어갈 때
  1번·나올 때 1번.
- **드라이버/스테이징은 어려운 부분이 아니다.** C++로 쓰는 비용 < JS↔C++ 오케스트레이션
  비용이고, "엔진이 명령셋 단일 소스"(JS drift 방지) 불변식도 보존된다.

**JS를 더 쓰고 싶을 때의 유일한 변형**: 명령 *의미*는 엔진에 두되, 출력 포매팅·help·UX만
JS가 `messages` 카탈로그를 소비해 담당한다(`interfaces/01-cli-seam.md`의 "future JS-side
CLI" 메모). 경계를 거칠게 유지하면서 JS 편의를 취하는 길.

---

## 6. 프로덕션 설계 (목표)

위 §1~4가 현재 **PoC 스켈레톤**이라면, 이 절은 LLVM 프로덕션 **목표 구조**다
([BlackShell_Plan.md §6](BlackShell_Plan.md), 모델 P · C-ABI 이음매). LLVM
프론트엔드·미들엔드·백엔드는 **블랙박스 파사드**로 두고, 우리 IP와 PoC에서 넘어오는
계약(패스 계약 · 드라이버 단일 I/O · 메시지 카탈로그)만 명시한다.

![BlackShell 프로덕션 아키텍처](image/Architecture.png)

**그림 3. 프로덕션 아키텍처 (정본).** 두 경계 — `«BlackShell CLI»`(JS 론처) 와
`«Engine · C++ — seal pipeline»`(C++ 엔진). 데이터패스 `SourceCode(IN) → Frontend → Gate →
Noising → Backend → Artifact(.o/.so, OUT)`. 해칭 = LLVM 블랙박스(Frontend·Backend), 회색 =
우리 IP(Gate·Noising·EquivalenceHarness), 점선 = 제어/검증. Backend가 `.o`를 직접 emit하고,
`Artifact`가 우리 결과물의 종점이다(UserCompiler·최종 바이너리는 범위 밖). 편집 가능한
원본: `BlackShell.drawio`.

**교체점(계약).** 그림의 회색 박스 = 우리 IP. 계약 2개가 교체점이다 — `Gate`(IR→Verdict,
§5 조건1)와 `Noising`(IR→IR). PoC의 더미(accept-all 게이트 · identity 노이징)를 실제 구현으로
갈아끼우는 자리이며, 노이징은 L1·L2를 OLLVM 포크로, L3를 우리 carry-sensitive MBA로 채운다.

### PoC → 프로덕션 매핑

| PoC (Python) | 프로덕션 (C++) | 성격 |
| --- | --- | --- |
| `driver._emit` / `messages` | `Driver`(엔진 내부: dispatch + seal) | 단일 I/O 지점·카탈로그 유지 |
| `passes.dummy_gate` (IR→Verdict) | `Gate` (§5 조건1) | **우리 IP** — accept-all 교체 |
| `passes._identity` (IR→IR) | `Noising` (OLLVM L1/L2 + 우리 MBA L3) | **L3는 우리 IP** |
| `harness.verify` (인터프리터) | `EquivalenceHarness` (컴파일·네이티브 실행) | **우리 IP** — 안전망 |
| `ir.load_ir` (토이 JSON) | `Frontend.compile` (블랙박스) | LLVM 소유 |
| `interp.run` (토이 백엔드) | `Backend.codegen` → **`.o` 직접 emit** | LLVM 소유 |
| `_write_artifact` (JSON) | `Artifact(.o/.so)` 종점 (Backend가 씀) | 값 경계; 별도 writer 없음 |

### 설계 노트

- **파일 I/O는 전부 C++ 엔진 소유** (규칙). JS Launcher는 파일을 **열지 않는다** — argv의
  경로를 불투명 문자열로 받아 그대로 넘길 뿐이다. 소스 읽기(`Frontend`), 스테이징, 아티팩트
  쓰기(`Backend`)까지 모든 파일 접근은 엔진 안에서 일어난다. 이점: ① 경로 해석·존재 검사·
  에러가 한 언어(C++)에 모여 drift·중복 I/O 없음, ② JS는 바이너리를 교체해도 무변경인 얇은
  론처로 유지, ③ 소스 '내용'이 JS를 거치지 않아 값 경계가 깨끗함. (PoC도 이미 이러함 —
  `bin/blackshell.js`는 IR 파일을 안 읽고 forward만.)
- **데이터패스 (IN→OUT)**: `SourceCode`(소스 내용)가 입력이다. 경로는 argv로 `Launcher →
  Driver`로 흐르고, `Driver`가 유닛 봉인을 구동하면 `Frontend`가 그 경로의 소스를 읽어
  `Module`을 만든다 → `Gate`(통과/거부) → `Noising` → `Backend`가 `.o` emit → `Artifact`.
  경계를 넘나드는 건 경로 문자열과 최종 아티팩트뿐이다.
- **두 경계**: ① `«BlackShell CLI»`(JS 론처) ↔ `«Engine · C++»`(엔진) = 서브프로세스 이음매
  (argv/stdio/exit). ② 엔진 ↔ 사용자 = **C-ABI 아티팩트**(`.o/.so`, call-by-value 값 경계,
  §5 조건1과 같은 지점). `UserCompiler`·최종 바이너리는 **우리 범위 밖**이라 그림에서 뺐다.
- **우리 패스는 LLVM PassManager 안에서 돈다.** `Gate`·`Noising`은 우리 코드지만 LLVM
  최적화기 파이프라인에 등록돼 실행된다(OLLVM이 선례). 그래서 그림에선 LLVM(`Frontend`·
  `Backend`)만 블랙박스로 두고 PassManager는 주석으로 처리한다.
- **아티팩트는 `Backend`가 쓴다.** `.o` 바이트 생성·기록은 LLVM `Backend`(llc)의 일이라,
  별도 `ArtifactWriter`는 두지 않는다 — 중복이라 접었다. (`.o→.so` 패키징·출력 경로 정책만
  필요하면 `Driver`가 담당.) 종점은 `Artifact(.o/.so)`.
