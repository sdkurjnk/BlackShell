# 04. primitive 계약

> primitive 시그니처(`engine.hpp`). — 인터페이스 ①.

각 primitive는 자기 `.cpp` 하나(`gate`/`noising`/`harness`/`frontend`/`backend`). 성공/실패를 `bool`로
반환(프론트엔드만 `Module` 포인터, `nullptr`=실패)하고 문구는 안 낸다. IR은 인메모리 `llvm::Module`로 오간다(문서 03).

## 게이트 `gate_check(const llvm::Module&) -> bool` (우리 IP)

read-only 판정. 격리 조건(외부 메모리 비공유) 위반이면 `false` → Driver 중단 + exit 2. 더미(`gate.cpp`) = **accept-all**.

> ⚠️ 현재 accept-all이라 어떤 유닛도 거부하지 않는다 — "봉인됨"은 거짓 확신.

## 노이징 `noising_apply(llvm::Module&, levels) -> bool` (우리 IP)

IR을 in place 변환. 의미 보존이 절대 불변식(하네스가 뒤에서 검증). `levels`는 적용할 **직교 집합**
(예 `{L1,L2}`, 빈 집합=L0 항등). 사다리 아님·단일 다이얼 아님 — 집합이라야 하네스가 패스별로 켠다.
Launcher→엔진까지 배선 완료(문서 02). 더미(`noising.cpp`) = **항등**(levels 무시).

## 등가검증 `harness_verify(pure_obj, noised_obj) -> bool` (우리 IP)

문서 05. pure.o vs noised.o를 비교. 더미는 항상 `true`.

## 프론트엔드 / 최적화 / 백엔드 (LLVM, 비-IP · 진짜 구현)

```cpp
std::unique_ptr<llvm::Module> frontend_compile(const std::string& src, llvm::LLVMContext& ctx);  // 임베드 Clang: source → Module
void optimize_apply(llvm::Module& m);                                                           // LLVM opt(O2): Module in place
bool backend_emit(llvm::Module& m, const std::string& obj_out);                                 // 임베드 LLVM: Module → .o
```
