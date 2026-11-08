# 05. 등가검증 하네스 (EquivalenceHarness)

> 변환 전후 IR이 같은 입력에 같은 출력을 내는지 검증하는 안전망. — §9 척추 ③. `harness.cpp`.

```cpp
bool harness_verify(const std::string& baseline_ir, const std::string& transformed_ir);  // true = 등가
```

- baseline = L0(노이징 전), transformed = 노이징 후. 둘을 **컴파일·실행**해 **관측 출력만**(`returns`) 비교 —
  내부 레지스터·명령 수·경로는 노이징이 바꾸는 것이라 제외. 다르면 `false` → `verify.broken`, exit 1.
- `enshell` 파이프라인에 **상시 내장**(노이징 뒤, 백엔드 앞). CI에서 더미→실제 교체 시 통과가 머지 조건.
- 지금 더미는 항상 `true`(항등 노이징). `driver_enshell`이 `harness_verify(ir, ir)`로 호출(baseline == transformed).
- 표본 검증 — "반례 부재"이지 등가 "증명"은 아니다(§5 조건2).

> 배포에서 빠지는 건 재사용성 벤치마크(§9 페3)이지 이 하네스가 아니다 — 하네스 = 정확성, 벤치마크 = 효과 측정.
