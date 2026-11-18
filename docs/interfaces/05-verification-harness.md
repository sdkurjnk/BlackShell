# 05. 등가검증 하네스 (EquivalenceHarness)

> 변환 전후 IR이 같은 입력에 같은 출력을 내는지 검증하는 안전망. — 인터페이스 ③. `harness.cpp`.

```cpp
bool harness_verify(const llvm::Module& baseline, const llvm::Module& transformed);  // true = 등가
```

- baseline = L0(노이징 전), transformed = 노이징 후. 둘을 **컴파일·실행**해 **관측 출력만**(`returns`) 비교 —
  내부 레지스터·명령 수·경로는 노이징이 바꾸는 것이라 제외. 다르면 `false` → `verify.broken`, exit 1.
- `enshell` 파이프라인에 **상시 내장**(노이징 뒤, 백엔드 앞).
- 지금 더미는 항상 `true`(항등 노이징). `driver_enshell`이 노이징 전 Module을 복제해 `harness_verify(baseline, 변환본)`으로 호출(지금은 둘이 등가).
- 표본 검증 — "반례 부재"이지 등가 "증명"은 아니다.
