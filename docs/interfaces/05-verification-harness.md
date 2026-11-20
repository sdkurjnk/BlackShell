# 05. 등가검증 하네스 (EquivalenceHarness)

> 변환 전후 IR이 같은 입력에 같은 출력을 내는지 검증하는 안전망. — 인터페이스 ③. `harness.cpp`.

```cpp
bool harness_verify(const std::string& pure_obj, const std::string& noised_obj);  // true = 등가
```

- `pure_obj` = 최적화·무노이즈 오브젝트, `noised_obj` = 최적화+노이즈 오브젝트. 둘을 **링크·실행**해 **관측 출력만**(`returns`) 비교 —
  내부 레지스터·명령 수·경로는 노이징이 바꾸는 것이라 제외. 다르면 `false` → `verify.broken`, exit 1.
- `enshell` 파이프라인에 **상시 내장**(두 `.o` emit 뒤).
- 지금 더미는 항상 `true`(항등 노이징). `driver_enshell`이 Optimization 뒤 fork로 pure/noised를 만들어 각각 `.o`로 emit하고 `harness_verify(pure.o, noised.o)`로 호출(지금은 둘이 등가, pure.o는 검증 후 삭제).
- 표본 검증 — "반례 부재"이지 등가 "증명"은 아니다.
