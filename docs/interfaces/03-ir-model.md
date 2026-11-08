# 03. IR 모델 (LLVM IR · 격리 메모리)

> primitive 입출력이자 등가검증 대상인 중간 표현.

- **LLVM IR 텍스트(`.ll`)** — `clang -S -emit-llvm`이 소스에서 생성(`frontend.cpp`). 토이 IR·인터프리터 없음.
- primitive 사이를 **파일 경로**로 전달(`<name>.ll`), 백엔드가 `.o`로 내린 뒤 정리.
  `shortcut: 파일 경로 핸드오프, libLLVM in-process 링크 시 Module* 핸들로 올림.`
- 유닛 = 함수. 보존 대상은 `params → returns` 경계 매핑, 내부 SSA·블록·분기는 노이징이 바꾼다.

## 격리 메모리 (§5 조건1)

call-by-value·외부 비공유가 전제 — 외부 포인터·전역·I/O로 상태를 공유하면 의미 보존이 깨진다. LLVM IR은
외부 참조를 표현할 수 있어 그 유입을 **게이트(문서 04)가 판정**한다(현재 더미 accept-all이라 비어 있음).
