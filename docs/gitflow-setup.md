# GitFlow 파이프라인 — GitHub 세팅 런북

이 문서는 워크플로 파일을 레포에 올린 뒤, 파이프라인이 실제로 돌게 만드는 **GitHub 쪽 설정**을
순서대로 정리한다. 대부분 `gh` CLI로 자동화하고, **GitHub App 생성/설치만 사용자 수동**이다.

대상 레포: `sdkurjnk/BlackShell`

---

## 0. 부트스트랩 (브랜치·태그)

워크플로/템플릿/문서를 `master`에 커밋한 뒤:

```bash
# (레포 루트에서)
git branch -m main master                       # 기본 브랜치명을 master로
git push -u origin master
gh repo edit sdkurjnk/BlackShell --default-branch master
git tag v0.1.0                                   # 초기 커밋에 베이스 태그 (git describe 기준점)
git push origin v0.1.0
git branch develop master                        # develop을 master에서 분기
git push -u origin develop
```

확인: `git describe --tags origin/develop` → `v0.1.0` (또는 `v0.1.0-0-g…`).

---

## 1. 라벨 (버전 bump)

```bash
gh label create major --color B60205 --description "Breaking change (X.0.0)"   -R sdkurjnk/BlackShell
gh label create minor --color 0E8A16 --description "Backward-compatible feature (x.Y.0)" -R sdkurjnk/BlackShell
gh label create patch --color FBCA04 --description "Backward-compatible fix (x.y.Z)"      -R sdkurjnk/BlackShell
```

## 2. auto-merge 허용

```bash
gh api -X PATCH repos/sdkurjnk/BlackShell -F allow_auto_merge=true
```

---

## 3. GitHub App (사용자 수동)

finalize·merge-release·post-merge 워크플로는 **GitHub App 토큰**으로 동작해야 한다
(기본 `GITHUB_TOKEN`이 만든 PR/Release는 후속 워크플로를 트리거하지 못함). BlackShell **전용 App**을 새로 만든다.

1. GitHub → Settings → Developer settings → **GitHub Apps** → **New GitHub App**
   - 이름: 예) `blackshell-release-bot`
   - Homepage URL: 레포 주소 아무거나
   - Webhook: **Active 체크 해제**
   - **Repository permissions**:
     - Contents: **Read and write**
     - Pull requests: **Read and write**
     - Administration 또는 Workflows은 불필요 (브랜치 생성은 Contents로 충분)
   - 생성 후 **App ID** 기록, **Generate a private key**로 `.pem` 다운로드.
2. 좌측 **Install App** → `sdkurjnk/BlackShell`에 설치(Only select repositories).

## 4. 시크릿 등록 (App 정보)

```bash
gh secret set APP_ID --body "<App ID>" -R sdkurjnk/BlackShell
gh secret set APP_PRIVATE_KEY < path/to/blackshell-release-bot.private-key.pem -R sdkurjnk/BlackShell
```

---

## 5. Ruleset 4개

> bypass actor의 `actor_id`는 **App ID**(3단계에서 기록한 값, integration id와 동일), `actor_type`은 `Integration`.
> 아래 `APP_ID` 자리에 그 숫자를 넣는다. `gh api`로 POST한다.

### 5-1. `require-approval` (master·develop, App bypass)

```bash
gh api -X POST repos/sdkurjnk/BlackShell/rulesets --input - <<'JSON'
{
  "name": "require-approval",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/master","refs/heads/develop"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": APP_ID, "actor_type": "Integration", "bypass_mode": "always" } ],
  "rules": [
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "require_last_push_approval": true,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "required_review_thread_resolution": false
    } },
    { "type": "non_fast_forward" },
    { "type": "deletion" }
  ]
}
JSON
```

### 5-2. `require-ci-master` (master, bypass 없음)

```bash
gh api -X POST repos/sdkurjnk/BlackShell/rulesets --input - <<'JSON'
{
  "name": "require-ci-master",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/master"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ { "context": "test" }, { "context": "Verify PR Checklist" } ]
    } }
  ]
}
JSON
```

### 5-3. `require-ci-develop` (develop, bypass 없음)

```bash
gh api -X POST repos/sdkurjnk/BlackShell/rulesets --input - <<'JSON'
{
  "name": "require-ci-develop",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/develop"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "test" },
          { "context": "Verify PR Checklist" },
          { "context": "Verify Version Label" },
          { "context": "Serialize Guard" }
        ]
    } }
  ]
}
JSON
```

### 5-4. `require-uptodate-develop` (develop, up-to-date 켬, App bypass)

```bash
gh api -X POST repos/sdkurjnk/BlackShell/rulesets --input - <<'JSON'
{
  "name": "require-uptodate-develop",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/develop"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": APP_ID, "actor_type": "Integration", "bypass_mode": "always" } ],
  "rules": [
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "Serialize Guard" } ]
    } }
  ]
}
JSON
```

---

## 왜 이렇게 쪼개나 (설계 근거)

- **승인(A)과 CI(B)를 분리**: Ruleset bypass는 그 룰셋의 규칙을 통째로 우회한다. App이 back-merge를
  승인 없이 머지하되 CI는 반드시 통과해야 하므로, 승인(App bypass)과 CI(bypass 없음)를 다른 룰셋에 둔다.
- **up-to-date를 develop 전용 + App bypass로 분리**: master에 up-to-date를 걸면 release→master가
  두 번째부터 교착되고, develop에 bypass 없이 걸면 App의 back-merge가 교착된다. 그래서 up-to-date만
  떼어 develop에, App만 우회하게 한다. CI 6→(여기선 4)개는 `require-ci-develop`(bypass 없음)에 있어 App도 통과.

---

## 검증

```bash
gh api repos/sdkurjnk/BlackShell/rulesets            # 4개 존재 확인
gh workflow list -R sdkurjnk/BlackShell              # 워크플로 6개 노출
```

드라이런: `feature/x` 브랜치(라벨 1개) → develop PR → 병합 → `release/v0.x.0` 자동 생성 →
Actions에서 **Finish Release / Hotfix** 실행 → 태그·PR 2개·App 머지 → GitHub Release·브랜치 삭제까지 로그 추적.
