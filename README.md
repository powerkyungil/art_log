# Art Log

작가 활동·과제 제출 관리 시스템의 가벼운 Node.js MVC 구현입니다.

## 기술 스택

- Node.js
- Express
- EJS
- SQLite (Node.js 내장 모듈)
- Vanilla JavaScript

별도 DB 서버, PHP, Apache가 필요하지 않습니다. `database/art_log.sqlite` 파일 하나가 로컬 데이터베이스입니다.

## 시작하기

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

기본 관리자 계정은 `.env`의 `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD` 값으로 생성됩니다.

- 관리자: http://localhost:3000/admin/login
- 작가: http://localhost:3000/에서 작가명으로 로그인

작가 계정은 등록 시 작가명이 아이디로 사용되고 비밀번호가 `1234`로 설정됩니다. 작가는 로그인 후 비밀번호를 변경할 수 있으며, 관리자는 작가 상세 화면에서 비밀번호를 `1234`로 초기화할 수 있습니다.

## 로컬 DB

기본 DB 파일은 `database/art_log.sqlite`입니다. 다른 위치를 사용하려면 `.env`의 `DB_FILE`만 수정합니다.

## 과제 대상 작가

관리자 과제 등록 화면에서 `특정 작가 지정` 또는 `전체 작가`를 선택할 수 있습니다. 새 과제는 특정 작가 지정이 기본이며, 지정된 작가에게만 과제가 노출되고 제출할 수 있습니다. 기존 과제는 마이그레이션 후 전체 작가 과제로 유지됩니다.

같은 주차에 여러 과제를 등록할 수 있으며, 관리자 화면에서는 과제 제목으로 각각 구분됩니다.

## 보안 참고

- `.env`는 커밋하지 않습니다.
- 작가 비밀번호는 bcrypt 해시로 저장합니다.
- 개발용 세션 저장소는 메모리 기반입니다. 외부 운영 배포 시에는 파일/DB 세션 저장소로 교체해야 합니다.
