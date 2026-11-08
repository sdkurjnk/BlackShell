# 04. primitive 계약

> primitive 시그니처(`engine.hpp`). 더미와 실제가 이 계약만 같으면 무중단 교체. — §9 척추 ①.

각 primitive는 자기 `.cpp` 하나(`gate`/`noising`/`harness`/`frontend`/`backend`). 성공/실패를 `bool`로
반환하고 문구는 안 낸다. IR은 파일 경로(`const std::string& ir`, 문서 03).

## 게이트 `gate_check(ir) -> bool` (우리 IP)

read-only 판정. §5 조건1(외부 메모리 비공유) 위반이면 `false` → Driver 중단 + exit 2. 더미(`gate.cpp`) = **accept-all**.

> ⚠️ accept-all은 "봉인됨"이라는 거짓 확신을 준다. **출하 전 반드시 실제 게이트로 교체.**

## 노이징 `noising_apply(ir) -> bool` (우리 IP)

IR을 in place 변환. 의미 보존이 절대 불변식(하네스가 뒤에서 검증). 레벨 L1/L2(OLLVM) · L3(carry-sensitive
MBA) — 아직 배선 안 됨(문서 02). 더미(`noising.cpp`) = **항등**(no-op) = "정확하지만 보호 안 됨".

## 등가검증 `harness_verify(baseline, transformed) -> bool` (우리 IP)

문서 05. 더미는 항상 `true`.

## 프론트엔드 / 백엔드 (LLVM 블랙박스)

```cpp
bool frontend_compile(const std::string& src, const std::string& ir_out);  // clang: source → .ll
bool backend_emit(const std::string& ir, const std::string& obj_out);      // llc: .ll → .o
```

`shortcut: std::system + 단순 인용, 인젝션 문제 시 argv exec로 교체.`
